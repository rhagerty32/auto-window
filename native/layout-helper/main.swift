import AppKit
import ApplicationServices
import Foundation

@main
enum LayoutHelper {
    static func main() {
        let args = Array(CommandLine.arguments.dropFirst())
        guard let command = args.first else {
            usage(exitCode: 1)
        }

        do {
            switch command {
            case "help", "-h", "--help":
                usage(exitCode: 0)
            case "check":
                try printJSON(["trusted": isTrusted(prompt: false)])
            case "screens":
                try printJSON(["screens": screensPayload()])
            case "spaces":
                try printJSON(spacesPayload())
            case "windows":
                try requireTrust()
                let bundleId = flag(args, "bundle-id")
                try printJSON(windowsPayload(bundleId: bundleId))
            case "space-switch":
                try requireTrust()
                try spaceSwitch(args)
                try printJSON(["ok": true])
            case "move":
                try requireTrust()
                try move(args)
                try printJSON(["ok": true])
            case "raise":
                try requireTrust()
                try raise(args)
                try printJSON(["ok": true])
            default:
                fputs("unknown command: \(command)\n", stderr)
                usage(exitCode: 1)
            }
        } catch let error as HelperError {
            fputs(error.message + "\n", stderr)
            Foundation.exit(Int32(error.exitCode))
        } catch {
            fputs(error.localizedDescription + "\n", stderr)
            Foundation.exit(1)
        }
    }
}

struct HelperError: Error {
    let message: String
    let exitCode: Int
}

struct RectJSON: Encodable {
    let x: Double
    let y: Double
    let width: Double
    let height: Double

    init(_ rect: CGRect) {
        x = rect.origin.x
        y = rect.origin.y
        width = rect.size.width
        height = rect.size.height
    }
}

struct ScreenJSON: Encodable {
    let id: String
    let uuid: String?
    let isBuiltin: Bool
    let isMain: Bool
    let frame: RectJSON
    let visibleFrame: RectJSON
}

struct WindowJSON: Encodable {
    let id: String
    let pid: Int32
    let index: Int
    let cgWindowId: UInt32?
    let bundleId: String?
    let appName: String?
    let title: String
    let frame: RectJSON
    let positionable: Bool
    let role: String
    let subrole: String
    let screenId: String?
    let spaceIndex: Int?
    let fullScreen: Bool
    let minimized: Bool
    let stackIndex: Int
}

struct WindowsPayload: Encodable {
    let running: Bool
    let windows: [WindowJSON]
}

func usage(exitCode: Int32) -> Never {
    fputs(
        """
        layout-helper — list displays and move windows via Accessibility

        Usage:
          layout-helper screens
          layout-helper spaces
          layout-helper windows [--bundle-id ID]
          layout-helper space-switch --screen-id ID --index N
          layout-helper move --id PID:INDEX --x N --y N --width N --height N [--space N] [--screen-id ID] [--fullscreen]
          layout-helper move --cg-id WID --x N --y N --width N --height N [--space N] [--screen-id ID] [--fullscreen]
          layout-helper raise --cg-id WID
          layout-helper raise --id PID:INDEX
          layout-helper check

        """,
        stderr
    )
    Foundation.exit(exitCode)
}

func flag(_ args: [String], _ name: String) -> String? {
    guard let i = args.firstIndex(of: "--\(name)"), i + 1 < args.count else { return nil }
    return args[i + 1]
}

func requireFlag(_ args: [String], _ name: String) throws -> String {
    guard let value = flag(args, name) else {
        throw HelperError(message: "missing --\(name)", exitCode: 1)
    }
    return value
}

func requireInt(_ args: [String], _ name: String) throws -> Int {
    guard let raw = flag(args, name), let value = Int(raw) else {
        throw HelperError(message: "missing or invalid --\(name)", exitCode: 1)
    }
    return value
}

func requireDouble(_ args: [String], _ name: String) throws -> Double {
    guard let raw = flag(args, name), let value = Double(raw) else {
        throw HelperError(message: "missing or invalid --\(name)", exitCode: 1)
    }
    return value
}

func isTrusted(prompt: Bool) -> Bool {
    if prompt {
        let key = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
        return AXIsProcessTrustedWithOptions([key: true] as CFDictionary)
    }
    return AXIsProcessTrusted()
}

func requireTrust() throws {
    if isTrusted(prompt: false) { return }
    _ = isTrusted(prompt: true)
    if isTrusted(prompt: false) { return }
    throw HelperError(
        message: "accessibility_untrusted: enable layout-helper in System Settings → Privacy & Security → Accessibility",
        exitCode: 2
    )
}

func printJSON(_ value: some Encodable) throws {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    let data = try encoder.encode(value)
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data("\n".utf8))
}

func displayId(for screen: NSScreen) -> CGDirectDisplayID {
    let key = NSDeviceDescriptionKey("NSScreenNumber")
    return (screen.deviceDescription[key] as? NSNumber)?.uint32Value ?? 0
}

/// Cocoa (bottom-left, Y up) → Quartz/AX (top-left of menu-bar screen, Y down).
func quartzRect(fromCocoa cocoa: CGRect) -> CGRect {
    guard let primary = NSScreen.screens.first else { return cocoa }
    let y = primary.frame.maxY - cocoa.maxY
    return CGRect(x: cocoa.origin.x, y: y, width: cocoa.width, height: cocoa.height)
}

func screensPayload() -> [ScreenJSON] {
    NSScreen.screens.map { screen in
        let id = displayId(for: screen)
        let quartzFrame = CGDisplayBounds(id)
        return ScreenJSON(
            id: String(id),
            uuid: displayUUIDString(id),
            isBuiltin: CGDisplayIsBuiltin(id) != 0,
            isMain: CGDisplayIsMain(id) != 0,
            frame: RectJSON(quartzFrame),
            visibleFrame: RectJSON(quartzRect(fromCocoa: screen.visibleFrame))
        )
    }
}

func windowsPayload(bundleId: String?) -> WindowsPayload {
    var running = false
    var windows: [WindowJSON] = []
    let displays = loadDisplaySpaces()
    let ranks = cgStackRanks()

    for app in NSWorkspace.shared.runningApplications {
        if app.activationPolicy != .regular { continue }
        if let bundleId, app.bundleIdentifier != bundleId { continue }
        if let bundleId, app.bundleIdentifier == bundleId { running = true }
        if bundleId == nil { running = true }

        windows.append(contentsOf: axWindows(for: app, displays: displays, ranks: ranks))
    }

    if let bundleId, !running {
        running = NSWorkspace.shared.runningApplications.contains { $0.bundleIdentifier == bundleId }
    }

    windows.append(contentsOf: extraCGWindows(existing: windows, bundleId: bundleId, displays: displays, ranks: ranks))
    return WindowsPayload(running: running, windows: windows)
}

func enrichSpace(wid: UInt32?, frame: CGRect, displays: [ParsedDisplaySpaces]) -> (screenId: String?, spaceIndex: Int?, fullScreen: Bool) {
    if let wid, let sid = spaceId(forWindow: wid), sid != 0 {
        for display in displays {
            if display.fullscreenIds.contains(sid) {
                return (display.screenId ?? screenIdContaining(rect: frame), 1, true)
            }
            if let space = display.spaces.first(where: { $0.id == sid }) {
                return (display.screenId ?? screenIdContaining(rect: frame), space.index, false)
            }
        }
    }
    let screenId = screenIdContaining(rect: frame)
    return (screenId, 1, frameLooksFullscreen(frame, screenId: screenId))
}

func axWindows(for app: NSRunningApplication, displays: [ParsedDisplaySpaces], ranks: [UInt32: Int]) -> [WindowJSON] {
    let pid = app.processIdentifier
    let axApp = AXUIElementCreateApplication(pid)
    // Listing with Enhanced UI on hides Ghostty/Electron AX windows and leaves the
    // flag stuck on, so later helper runs only see 500×500 WindowServer ghosts.
    AXUIElementSetAttributeValue(axApp, "AXEnhancedUserInterface" as CFString, kCFBooleanFalse)
    AXUIElementSetAttributeValue(axApp, "AXManualAccessibility" as CFString, kCFBooleanFalse)
    guard let elements = copyArray(axApp, kAXWindowsAttribute as CFString) else { return [] }

    var result: [WindowJSON] = []
    for (index, element) in elements.enumerated() {
        let role = copyString(element, kAXRoleAttribute as CFString) ?? ""
        if role != (kAXWindowRole as String) { continue }

        let subrole = copyString(element, kAXSubroleAttribute as CFString) ?? ""
        let title = copyString(element, kAXTitleAttribute as CFString) ?? ""
        let minimized = copyBool(element, kAXMinimizedAttribute as CFString)
        let position = copyPoint(element, kAXPositionAttribute as CFString)
        let size = copySize(element, kAXSizeAttribute as CFString)
        let wid = cgWindowId(for: element)
        let dialog =
            subrole == (kAXSystemDialogSubrole as String)
            || subrole == (kAXDialogSubrole as String)
            || subrole == "AXSheet"

        let frame: CGRect
        if let position, let size {
            frame = CGRect(origin: position, size: size)
        } else {
            frame = .zero
        }

        let positionable =
            !minimized && !dialog && (size?.width ?? 0) >= 80 && (size?.height ?? 0) >= 80
        let space = enrichSpace(wid: wid, frame: frame, displays: displays)
        let axFull = copyBool(element, "AXFullScreen" as CFString)

        result.append(
            WindowJSON(
                id: "\(pid):\(index)",
                pid: pid,
                index: index,
                cgWindowId: wid,
                bundleId: app.bundleIdentifier,
                appName: app.localizedName,
                title: title,
                frame: RectJSON(frame),
                positionable: positionable,
                role: role,
                subrole: subrole,
                screenId: space.screenId,
                spaceIndex: space.spaceIndex,
                fullScreen: axFull || space.fullScreen,
                minimized: minimized,
                stackIndex: cgStackIndex(for: wid, ranks: ranks)
            )
        )
    }
    return result
}

func extraCGWindows(existing: [WindowJSON], bundleId: String?, displays: [ParsedDisplaySpaces], ranks: [UInt32: Int]) -> [WindowJSON] {
    let seen = Set(existing.compactMap(\.cgWindowId))
    let pidsWithStandard = Set(existing.filter { $0.subrole == "AXStandardWindow" }.map(\.pid))
    let options: CGWindowListOption = [.optionAll, .excludeDesktopElements]
    guard let raw = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else {
        return []
    }

    var extras: [WindowJSON] = []
    for info in raw {
        let layer = (info[kCGWindowLayer as String] as? NSNumber)?.intValue ?? 0
        if layer != 0 { continue }
        let wid = (info[kCGWindowNumber as String] as? NSNumber)?.uint32Value ?? 0
        if wid == 0 || seen.contains(wid) { continue }
        let pid = (info[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value ?? 0
        guard let app = NSRunningApplication(processIdentifier: pid), app.activationPolicy == .regular else {
            continue
        }
        if let bundleId, app.bundleIdentifier != bundleId { continue }
        let bounds = info[kCGWindowBounds as String] as? [String: Any]
        let x = (bounds?["X"] as? NSNumber)?.doubleValue ?? 0
        let y = (bounds?["Y"] as? NSNumber)?.doubleValue ?? 0
        let w = (bounds?["Width"] as? NSNumber)?.doubleValue ?? 0
        let h = (bounds?["Height"] as? NSNumber)?.doubleValue ?? 0
        if w < 80 || h < 80 { continue }
        // Untitled 500×500 frames are WindowServer privacy/ghost placeholders, not real windows.
        if abs(w - 500) <= 24, abs(h - 500) <= 24 { continue }
        let title = (info[kCGWindowName as String] as? String) ?? ""
        // Untitled CG extras are almost always window-server ghosts when the app already has a real AX window.
        if title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, pidsWithStandard.contains(pid) {
            continue
        }
        let frame = CGRect(x: x, y: y, width: w, height: h)
        let space = enrichSpace(wid: wid, frame: frame, displays: displays)
        extras.append(
            WindowJSON(
                id: "cg:\(wid)",
                pid: pid,
                index: -1,
                cgWindowId: wid,
                bundleId: app.bundleIdentifier,
                appName: app.localizedName,
                title: title,
                frame: RectJSON(frame),
                positionable: true,
                role: "AXWindow",
                subrole: "CGWindow",
                screenId: space.screenId,
                spaceIndex: space.spaceIndex,
                fullScreen: space.fullScreen,
                minimized: false,
                stackIndex: cgStackIndex(for: wid, ranks: ranks)
            )
        )
    }
    return extras
}

func raise(_ args: [String]) throws {
    var element: AXUIElement?
    var wid: UInt32?

    if let cgRaw = flag(args, "cg-id"), let parsed = UInt32(cgRaw) {
        wid = parsed
        if let pid = ownerPid(forCGWindow: parsed) {
            enableEnhancedAX(AXUIElementCreateApplication(pid))
        }
        element = axElement(cgWindowId: parsed)
    } else if let id = flag(args, "id") {
        let found = try window(id: id)
        element = found
        wid = cgWindowId(for: found)
    } else {
        throw HelperError(message: "raise requires --cg-id or --id", exitCode: 1)
    }

    // Window-server order first so AXRaise does not pull every app window forward as a group.
    if let wid {
        orderCGWindowFront(wid)
    }
    if let element {
        _ = AXUIElementPerformAction(element, kAXRaiseAction as CFString)
    }
}

func move(_ args: [String]) throws {
    let x = try requireDouble(args, "x")
    let y = try requireDouble(args, "y")
    let width = try requireDouble(args, "width")
    let height = try requireDouble(args, "height")
    let target = CGRect(x: x, y: y, width: width, height: height)
    let displays = loadDisplaySpaces()

    var element: AXUIElement?
    var wid: UInt32?

    if let cgRaw = flag(args, "cg-id"), let parsed = UInt32(cgRaw) {
        wid = parsed
        element = axElement(cgWindowId: parsed)
        if element == nil, let pid = ownerPid(forCGWindow: parsed) {
            enableEnhancedAX(AXUIElementCreateApplication(pid))
            element = axElement(cgWindowId: parsed)
        }
    } else if let id = flag(args, "id") {
        let found = try window(id: id)
        element = found
        wid = cgWindowId(for: found)
    } else {
        let pidRaw = try requireFlag(args, "pid")
        guard let pid = Int32(pidRaw) else {
            throw HelperError(message: "invalid --pid", exitCode: 1)
        }
        enableEnhancedAX(AXUIElementCreateApplication(pid))
        let contains = try requireFlag(args, "title-contains")
        let found = try window(pid: pid, titleContains: contains)
        element = found
        wid = cgWindowId(for: found)
    }

    let wantFullScreen = ["1", "true", "yes"].contains((flag(args, "fullscreen") ?? "").lowercased())
    var bundleId = flag(args, "bundle-id")
    if bundleId == nil, let wid, let pid = ownerPid(forCGWindow: wid) {
        bundleId = NSRunningApplication(processIdentifier: pid)?.bundleIdentifier
    }

    if let spaceIndex = flag(args, "space").flatMap(Int.init), let wid, !wantFullScreen {
        let screenId = flag(args, "screen-id")
        if let hit = lookupSpace(screenId: screenId, index: spaceIndex, displays: displays) {
            try moveCGWindow(wid, to: hit.space.id)
            try? switchSpace(displayUUID: hit.uuid, space: hit.space.id)
            usleep(200_000)
            if element == nil {
                if let pid = ownerPid(forCGWindow: wid) {
                    enableEnhancedAX(AXUIElementCreateApplication(pid))
                }
                element = axElement(cgWindowId: wid)
            }
        } else {
            fputs("space \(spaceIndex) not found; placing on current Space\n", stderr)
        }
    }

    let axFull = element.map { copyBool($0, "AXFullScreen" as CFString) } ?? false
    let spaceFull =
        wid.flatMap { spaceId(forWindow: $0) }.map { sid in
            displays.contains { $0.fullscreenIds.contains(sid) }
        } ?? false
    let alreadyFull = axFull || spaceFull

    if wantFullScreen, alreadyFull {
        if let element {
            _ = setAXFullScreen(element, true)
        }
        return
    }

    if let element {
        setAXMinimized(element, false)
        if copyBool(element, "AXFullScreen" as CFString), !wantFullScreen {
            _ = setAXFullScreen(element, false)
            usleep(350_000)
        }
        try setBounds(element, target)
        if !frameClose(currentFrame(element), target), let wid {
            try? setCGWindowFrame(wid, target)
        }
        if wantFullScreen {
            usleep(150_000)
            if !setAXFullScreen(element, true) {
                if let bundleId {
                    appleScriptFullScreen(bundleId: bundleId)
                } else {
                    fputs("could not enter native fullscreen\n", stderr)
                }
            } else {
                usleep(400_000)
            }
        }
        return
    }
    if let wid {
        if wantFullScreen, alreadyFull {
            return
        }
        try setCGWindowFrame(wid, target)
        fputs("moved via window-server (no AX element)\n", stderr)
        if wantFullScreen {
            if let pid = ownerPid(forCGWindow: wid) {
                enableEnhancedAX(AXUIElementCreateApplication(pid))
                element = axElement(cgWindowId: wid)
            }
            if let element {
                _ = setAXFullScreen(element, true)
                usleep(400_000)
            } else if let bundleId {
                appleScriptFullScreen(bundleId: bundleId)
            } else {
                fputs("could not enter native fullscreen\n", stderr)
            }
        }
        return
    }
    throw HelperError(message: "could not resolve AX window after space move", exitCode: 1)
}

func spaceSwitch(_ args: [String]) throws {
    let index = try requireInt(args, "index")
    let screenId = flag(args, "screen-id")
    let displays = loadDisplaySpaces()
    guard let hit = lookupSpace(screenId: screenId, index: index, displays: displays) else {
        throw HelperError(message: "space \(index) not found", exitCode: 1)
    }
    try switchSpace(displayUUID: hit.uuid, space: hit.space.id)
}

func axElement(cgWindowId target: UInt32) -> AXUIElement? {
    for app in NSWorkspace.shared.runningApplications {
        if app.activationPolicy != .regular { continue }
        let axApp = AXUIElementCreateApplication(app.processIdentifier)
        guard let elements = copyArray(axApp, kAXWindowsAttribute as CFString) else { continue }
        for element in elements {
            if cgWindowId(for: element) == target {
                return element
            }
        }
    }
    return nil
}

func window(id: String) throws -> AXUIElement {
    if id.hasPrefix("cg:"), let wid = UInt32(id.dropFirst(3)), let element = axElement(cgWindowId: wid) {
        return element
    }
    let parts = id.split(separator: ":", maxSplits: 1)
    guard parts.count == 2, let pid = Int32(parts[0]), let index = Int(parts[1]) else {
        throw HelperError(message: "invalid --id (expected PID:INDEX)", exitCode: 1)
    }
    let axApp = AXUIElementCreateApplication(pid)
    guard let elements = copyArray(axApp, kAXWindowsAttribute as CFString) else {
        throw HelperError(message: "no windows for pid \(pid)", exitCode: 1)
    }
    guard index >= 0, index < elements.count else {
        throw HelperError(message: "window index \(index) out of range", exitCode: 1)
    }
    return elements[index]
}

func window(pid: Int32, titleContains: String) throws -> AXUIElement {
    let axApp = AXUIElementCreateApplication(pid)
    guard let elements = copyArray(axApp, kAXWindowsAttribute as CFString) else {
        throw HelperError(message: "no windows for pid \(pid)", exitCode: 1)
    }
    let needle = titleContains.lowercased()
    for element in elements {
        let title = (copyString(element, kAXTitleAttribute as CFString) ?? "").lowercased()
        if title.contains(needle) {
            return element
        }
    }
    throw HelperError(message: "no window title contains '\(titleContains)'", exitCode: 1)
}

func frameClose(_ a: CGRect?, _ b: CGRect, tolerance: CGFloat = 24) -> Bool {
    guard let a else { return false }
    return abs(a.minX - b.minX) < tolerance
        && abs(a.minY - b.minY) < tolerance
        && abs(a.width - b.width) < tolerance
        && abs(a.height - b.height) < tolerance
}

func currentFrame(_ element: AXUIElement) -> CGRect? {
    guard let origin = copyPoint(element, kAXPositionAttribute as CFString),
          let size = copySize(element, kAXSizeAttribute as CFString)
    else {
        return nil
    }
    return CGRect(origin: origin, size: size)
}

func setBounds(_ element: AXUIElement, _ rect: CGRect) throws {
    try withEnhancedAXOff(element) { live in
        _ = AXUIElementPerformAction(live, kAXRaiseAction as CFString)
        // Size, position, size: first size may clamp to the current display; second size
        // applies after origin is on-screen. Enhanced UI stays off for this write.
        try setSize(live, rect.size)
        try setPoint(live, rect.origin)
        try setSize(live, rect.size)
        try setPoint(live, rect.origin)
    }
}

func setPoint(_ element: AXUIElement, _ point: CGPoint) throws {
    var value = point
    guard let ax = AXValueCreate(.cgPoint, &value) else {
        throw HelperError(message: "could not wrap position", exitCode: 1)
    }
    let status = AXUIElementSetAttributeValue(element, kAXPositionAttribute as CFString, ax)
    if status != .success {
        throw HelperError(message: "set position failed (\(status.rawValue))", exitCode: 1)
    }
}

func setSize(_ element: AXUIElement, _ size: CGSize) throws {
    var value = size
    guard let ax = AXValueCreate(.cgSize, &value) else {
        throw HelperError(message: "could not wrap size", exitCode: 1)
    }
    let status = AXUIElementSetAttributeValue(element, kAXSizeAttribute as CFString, ax)
    if status != .success {
        throw HelperError(message: "set size failed (\(status.rawValue))", exitCode: 1)
    }
}

func copyArray(_ element: AXUIElement, _ attribute: CFString) -> [AXUIElement]? {
    var value: CFTypeRef?
    let status = AXUIElementCopyAttributeValue(element, attribute, &value)
    guard status == .success, let array = value as? [AXUIElement] else { return nil }
    return array
}

func copyString(_ element: AXUIElement, _ attribute: CFString) -> String? {
    var value: CFTypeRef?
    let status = AXUIElementCopyAttributeValue(element, attribute, &value)
    guard status == .success else { return nil }
    return value as? String
}

func copyBool(_ element: AXUIElement, _ attribute: CFString) -> Bool {
    var value: CFTypeRef?
    let status = AXUIElementCopyAttributeValue(element, attribute, &value)
    guard status == .success else { return false }
    if let number = value as? NSNumber { return number.boolValue }
    return false
}

func copyPoint(_ element: AXUIElement, _ attribute: CFString) -> CGPoint? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, attribute, &value) == .success, let ax = value else {
        return nil
    }
    var point = CGPoint.zero
    guard AXValueGetValue(ax as! AXValue, .cgPoint, &point) else { return nil }
    return point
}

func copySize(_ element: AXUIElement, _ attribute: CFString) -> CGSize? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, attribute, &value) == .success, let ax = value else {
        return nil
    }
    var size = CGSize.zero
    guard AXValueGetValue(ax as! AXValue, .cgSize, &size) else { return nil }
    return size
}
