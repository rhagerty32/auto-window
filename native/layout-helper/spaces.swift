import AppKit
import ApplicationServices
import CoreGraphics
import Darwin
import Foundation

typealias CGSConnectionID = Int32
typealias CGSSpaceID = UInt64

enum SkyLight {
    static let handle: UnsafeMutableRawPointer? = dlopen(
        "/System/Library/PrivateFrameworks/SkyLight.framework/SkyLight",
        RTLD_LAZY
    )

    static func sym<T>(_ names: String...) -> T? {
        guard let handle else { return nil }
        for name in names {
            if let ptr = dlsym(handle, name) {
                return unsafeBitCast(ptr, to: T.self)
            }
        }
        return nil
    }

    static let mainConnection: (@convention(c) () -> CGSConnectionID)? =
        sym("SLSMainConnectionID", "CGSMainConnectionID")

    static let copyManagedDisplaySpaces: (@convention(c) (CGSConnectionID) -> Unmanaged<CFArray>?)? =
        sym("SLSCopyManagedDisplaySpaces", "CGSCopyManagedDisplaySpaces")

    static let copySpacesForWindows: (@convention(c) (CGSConnectionID, Int32, CFArray) -> Unmanaged<CFArray>?)? =
        sym("SLSCopySpacesForWindows", "CGSCopySpacesForWindows")

    static let moveWindowsToManagedSpace: (@convention(c) (CGSConnectionID, CFArray, CGSSpaceID) -> Void)? =
        sym("SLSMoveWindowsToManagedSpace", "CGSMoveWindowsToManagedSpace")

    static let setCurrentSpace: (@convention(c) (CGSConnectionID, CFString, CGSSpaceID) -> Void)? =
        sym("SLSManagedDisplaySetCurrentSpace", "CGSManagedDisplaySetCurrentSpace")

    static let spaceSetCompatID: (@convention(c) (CGSConnectionID, CGSSpaceID, Int32) -> Int32)? =
        sym("SLSSpaceSetCompatID")

    static let setWindowListWorkspace: (@convention(c) (CGSConnectionID, UnsafePointer<UInt32>, Int32, Int32) -> Int32)? =
        sym("SLSSetWindowListWorkspace")

    static let moveWindowWithGroup: (@convention(c) (CGSConnectionID, UInt32, UnsafeMutablePointer<CGRect>) -> Int32)? =
        sym("CGSMoveWindowWithGroup", "SLSMoveWindowWithGroup")

    static let moveWindow: (@convention(c) (CGSConnectionID, UInt32, UnsafePointer<CGPoint>) -> Int32)? =
        sym("CGSMoveWindow", "SLSMoveWindow")

    /// CGSOrderWindow(cid, wid, mode, relativeTo). mode 1 = kCGSOrderAbove.
    static let orderWindow: (@convention(c) (CGSConnectionID, UInt32, Int32, UInt32) -> Int32)? =
        sym("CGSOrderWindow", "SLSOrderWindow")

    static let setWindowBounds: (@convention(c) (CGSConnectionID, UInt32, UnsafePointer<CGRect>) -> Int32)? =
        sym("CGSSetWindowBounds", "SLSSetWindowBounds")

    static var available: Bool {
        mainConnection != nil && copyManagedDisplaySpaces != nil
    }

    static func connection() throws -> CGSConnectionID {
        guard let mainConnection else {
            throw HelperError(message: "spaces_unavailable", exitCode: 3)
        }
        return mainConnection()
    }
}

@_silgen_name("_AXUIElementGetWindow")
func _AXUIElementGetWindow(_ element: AXUIElement, _ wid: UnsafeMutablePointer<UInt32>) -> AXError

struct SpaceJSON: Encodable {
    let index: Int
    let id: String
    let type: Int
}

struct SpaceDisplayJSON: Encodable {
    let uuid: String
    let screenId: String?
    let activeIndex: Int
    let activeFullscreen: Bool
    let spaces: [SpaceJSON]
}

struct SpacesPayload: Encodable {
    let available: Bool
    let separateSpaces: Bool
    let displays: [SpaceDisplayJSON]
}

struct ParsedSpace {
    let index: Int
    let id: CGSSpaceID
    let type: Int
}

struct ParsedDisplaySpaces {
    let uuid: String
    let screenId: String?
    let activeIndex: Int
    let activeFullscreen: Bool
    let spaces: [ParsedSpace]
    let fullscreenIds: Set<CGSSpaceID>
}

func displayUUIDString(_ id: CGDirectDisplayID) -> String? {
    guard let unmanaged = CGDisplayCreateUUIDFromDisplayID(id) else { return nil }
    let uuid = unmanaged.takeRetainedValue()
    return CFUUIDCreateString(nil, uuid) as String
}

func uuidToScreenId() -> [String: String] {
    var map: [String: String] = [:]
    for screen in NSScreen.screens {
        let id = displayId(for: screen)
        if let uuid = displayUUIDString(id) {
            map[uuid.lowercased()] = String(id)
        }
    }
    return map
}

func loadDisplaySpaces() -> [ParsedDisplaySpaces] {
    guard SkyLight.available,
          let copy = SkyLight.copyManagedDisplaySpaces,
          let conn = try? SkyLight.connection(),
          let unmanaged = copy(conn)
    else {
        return []
    }
    let array = unmanaged.takeRetainedValue() as? [[String: Any]] ?? []
    let uuidMap = uuidToScreenId()
    var result: [ParsedDisplaySpaces] = []

    for display in array {
        let uuid = (display["Display Identifier"] as? String) ?? ""
        let current = display["Current Space"] as? [String: Any]
        let currentId = spaceId(from: current)
        let rawSpaces = display["Spaces"] as? [[String: Any]] ?? []
        var spaces: [ParsedSpace] = []
        var fullscreenIds: Set<CGSSpaceID> = []
        var index = 1
        var activeIndex = 1
        for raw in rawSpaces {
            let type = (raw["type"] as? NSNumber)?.intValue ?? 0
            let sid = spaceId(from: raw)
            // 4 = native fullscreen (its own Mission Control desktop, e.g. labeled "Dia").
            if type == 4 {
                fullscreenIds.insert(sid)
                continue
            }
            // 0 = user Space. Skip other system spaces.
            if type != 0 { continue }
            if sid == currentId { activeIndex = index }
            spaces.append(ParsedSpace(index: index, id: sid, type: type))
            index += 1
        }
        if spaces.isEmpty && fullscreenIds.isEmpty { continue }
        let currentIsFullscreen = currentId != 0 && fullscreenIds.contains(currentId)
        result.append(
            ParsedDisplaySpaces(
                uuid: uuid,
                screenId: uuidMap[uuid.lowercased()],
                activeIndex: activeIndex,
                activeFullscreen: currentIsFullscreen,
                spaces: spaces,
                fullscreenIds: fullscreenIds
            )
        )
    }
    return result
}

func spaceId(from dict: [String: Any]?) -> CGSSpaceID {
    if let n = dict?["id64"] as? NSNumber { return n.uint64Value }
    if let n = dict?["ManagedSpaceID"] as? NSNumber { return n.uint64Value }
    return 0
}

func inferSeparateSpaces(_ displays: [ParsedDisplaySpaces]) -> Bool {
    let screenCount = NSScreen.screens.count
    if displays.isEmpty || screenCount == 0 {
        return true
    }
    if screenCount == 1 {
        return true
    }
    return displays.count > 1
}

func spacesPayload() -> SpacesPayload {
    let displays = loadDisplaySpaces()
    let separate = inferSeparateSpaces(displays)
    return SpacesPayload(
        available: SkyLight.available && !displays.isEmpty,
        separateSpaces: separate,
        displays: displays.map { display in
            SpaceDisplayJSON(
                uuid: display.uuid,
                screenId: display.screenId,
                activeIndex: display.activeIndex,
                activeFullscreen: display.activeFullscreen,
                spaces: display.spaces.map { SpaceJSON(index: $0.index, id: String($0.id), type: $0.type) }
            )
        }
    )
}

func cgWindowId(for element: AXUIElement) -> UInt32? {
    var wid: UInt32 = 0
    let status = _AXUIElementGetWindow(element, &wid)
    guard status == .success, wid != 0 else { return nil }
    return wid
}

func spaceId(forWindow wid: UInt32) -> CGSSpaceID? {
    guard let copy = SkyLight.copySpacesForWindows, let conn = try? SkyLight.connection() else {
        return nil
    }
    let list = [NSNumber(value: wid)] as CFArray
    guard let unmanaged = copy(conn, 7, list) else { return nil }
    let spaces = unmanaged.takeRetainedValue() as? [NSNumber] ?? []
    return spaces.first?.uint64Value
}

func spaceIndex(forWindow wid: UInt32, displays: [ParsedDisplaySpaces]) -> (screenId: String?, index: Int)? {
    guard let sid = spaceId(forWindow: wid), sid != 0 else { return nil }
    for display in displays {
        if let space = display.spaces.first(where: { $0.id == sid }) {
            return (display.screenId, space.index)
        }
    }
    return nil
}

func lookupSpace(screenId: String?, index: Int, displays: [ParsedDisplaySpaces]) -> (uuid: String, space: ParsedSpace)? {
    let target = displays.first { display in
        if let screenId { return display.screenId == screenId }
        return false
    } ?? displays.first
    guard let target, let space = target.spaces.first(where: { $0.index == index }) ?? target.spaces.last else {
        return nil
    }
    return (target.uuid, space)
}

func moveCGWindow(_ wid: UInt32, to space: CGSSpaceID) throws {
    guard let conn = try? SkyLight.connection() else {
        throw HelperError(message: "spaces_unavailable", exitCode: 3)
    }
    if let move = SkyLight.moveWindowsToManagedSpace {
        move(conn, [NSNumber(value: wid)] as CFArray, space)
        return
    }
    if let setCompat = SkyLight.spaceSetCompatID, let setList = SkyLight.setWindowListWorkspace {
        _ = setCompat(conn, space, 0x7961_6265)
        var id = wid
        _ = setList(conn, &id, 1, 0x7961_6265)
        _ = setCompat(conn, space, 0)
        return
    }
    throw HelperError(message: "spaces_unavailable", exitCode: 3)
}

func switchSpace(displayUUID: String, space: CGSSpaceID) throws {
    guard let conn = try? SkyLight.connection(), let setCurrent = SkyLight.setCurrentSpace else {
        throw HelperError(message: "spaces_unavailable", exitCode: 3)
    }
    setCurrent(conn, displayUUID as CFString, space)
}

func enableEnhancedAX(_ axApp: AXUIElement) {
    AXUIElementSetAttributeValue(axApp, "AXEnhancedUserInterface" as CFString, kCFBooleanTrue)
    AXUIElementSetAttributeValue(axApp, "AXManualAccessibility" as CFString, kCFBooleanTrue)
}

/// Chromium/Electron ignores AX size/position while AXEnhancedUserInterface is on.
func withEnhancedAXOff(_ element: AXUIElement, _ body: (AXUIElement) throws -> Void) throws {
    var pid: pid_t = 0
    let axApp: AXUIElement? = AXUIElementGetPid(element, &pid) == .success ? AXUIElementCreateApplication(pid) : nil
    let enhanced = axApp.map { copyBool($0, "AXEnhancedUserInterface" as CFString) } ?? false
    let manual = axApp.map { copyBool($0, "AXManualAccessibility" as CFString) } ?? false
    if let axApp, enhanced || manual {
        AXUIElementSetAttributeValue(axApp, "AXEnhancedUserInterface" as CFString, kCFBooleanFalse)
        AXUIElementSetAttributeValue(axApp, "AXManualAccessibility" as CFString, kCFBooleanFalse)
    }
    var live = element
    if let wid = cgWindowId(for: element), let again = axElement(cgWindowId: wid) {
        live = again
    }
    defer {
        if let axApp {
            if enhanced {
                AXUIElementSetAttributeValue(axApp, "AXEnhancedUserInterface" as CFString, kCFBooleanTrue)
            }
            if manual {
                AXUIElementSetAttributeValue(axApp, "AXManualAccessibility" as CFString, kCFBooleanTrue)
            }
        }
    }
    try body(live)
}

/// Front-to-back CGWindowList ranks. Higher = closer to front. Layer-0 only.
func cgStackRanks() -> [UInt32: Int] {
    let options: CGWindowListOption = [.optionAll, .excludeDesktopElements]
    guard let raw = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else {
        return [:]
    }
    let layer0 = raw.filter { (($0[kCGWindowLayer as String] as? NSNumber)?.intValue ?? 0) == 0 }
    let count = layer0.count
    var ranks: [UInt32: Int] = [:]
    for (index, info) in layer0.enumerated() {
        let wid = (info[kCGWindowNumber as String] as? NSNumber)?.uint32Value ?? 0
        if wid == 0 { continue }
        ranks[wid] = count - index
    }
    return ranks
}

func cgStackIndex(for wid: UInt32?, ranks: [UInt32: Int]) -> Int {
    guard let wid else { return 0 }
    return ranks[wid] ?? 0
}

func orderCGWindowFront(_ wid: UInt32) {
    guard let conn = try? SkyLight.connection(), let order = SkyLight.orderWindow else { return }
    _ = order(conn, wid, 1, 0)
}

func ownerPid(forCGWindow wid: UInt32) -> pid_t? {
    guard let raw = CGWindowListCopyWindowInfo([.optionIncludingWindow], wid) as? [[String: Any]],
          let info = raw.first
    else {
        return nil
    }
    return (info[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value
}

/// Chromium/Electron often has no AXUIElement; WindowServer can still place the CG window.
func setCGWindowFrame(_ wid: UInt32, _ rect: CGRect) throws {
    let conn = try SkyLight.connection()
    if let setBounds = SkyLight.setWindowBounds {
        var frame = rect
        if setBounds(conn, wid, &frame) == 0 {
            return
        }
    }
    if let grouped = SkyLight.moveWindowWithGroup {
        var frame = rect
        if grouped(conn, wid, &frame) == 0 {
            return
        }
    }
    if let move = SkyLight.moveWindow {
        var origin = rect.origin
        if move(conn, wid, &origin) == 0 {
            return
        }
    }
    throw HelperError(message: "could not resolve AX window after space move", exitCode: 1)
}

func appleScriptFullScreen(bundleId: String) {
    let escaped = bundleId.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
    let script = """
    tell application "System Events"
      set proc to first application process whose bundle identifier is "\(escaped)"
      set frontmost of proc to true
      delay 0.25
      try
        set value of attribute "AXFullScreen" of window 1 of proc to true
      end try
    end tell
    """
    let task = Process()
    task.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
    task.arguments = ["-e", script]
    do {
        try task.run()
        task.waitUntilExit()
    } catch {
        fputs("osascript fullscreen failed\n", stderr)
    }
}

func setAXFullScreen(_ element: AXUIElement, _ value: Bool) -> Bool {
    let status = AXUIElementSetAttributeValue(
        element,
        "AXFullScreen" as CFString,
        value ? kCFBooleanTrue : kCFBooleanFalse
    )
    return status == .success
}

func setAXMinimized(_ element: AXUIElement, _ value: Bool) {
    AXUIElementSetAttributeValue(
        element,
        kAXMinimizedAttribute as CFString,
        value ? kCFBooleanTrue : kCFBooleanFalse
    )
}

func frameLooksFullscreen(_ frame: CGRect, screenId: String?) -> Bool {
    guard let screenId, let id = UInt32(screenId) else { return false }
    let bounds = CGDisplayBounds(id)
    return abs(frame.minX - bounds.minX) < 4
        && abs(frame.minY - bounds.minY) < 4
        && abs(frame.width - bounds.width) < 8
        && abs(frame.height - bounds.height) < 8
}

func screenIdContaining(rect: CGRect) -> String? {
    let cx = rect.midX
    let cy = rect.midY
    for screen in NSScreen.screens {
        let id = displayId(for: screen)
        let frame = CGDisplayBounds(id)
        if frame.contains(CGPoint(x: cx, y: cy)) {
            return String(id)
        }
    }
    return nil
}
