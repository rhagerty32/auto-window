import { Action, ActionPanel, Form, Icon } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { useState } from "react";
import { listScreens } from "./lib/helper";
import { emptyPreset, upsertPreset } from "./lib/presets";
import { SlotList } from "./presets-ui";

export default function Command() {
  const { data: screens, isLoading } = usePromise(listScreens, []);
  const [presetId, setPresetId] = useState<string>();

  if (presetId) {
    return <SlotList presetId={presetId} onChange={() => undefined} />;
  }

  return (
    <Form
      isLoading={isLoading}
      navigationTitle="Create Preset"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Create Preset"
            icon={Icon.Plus}
            onSubmit={async (values: { name: string; isDefault: boolean }) => {
              const preset = emptyPreset(values.name.trim() || "Untitled");
              await upsertPreset({
                ...preset,
                isDefault: values.isDefault,
                displayCount: screens?.length,
              });
              setPresetId(preset.id);
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Description text="Name the preset, then add the windows it should place." />
      <Form.TextField id="name" title="Name" placeholder="Laptop" />
      <Form.Checkbox
        id="isDefault"
        title="Default"
        label={
          screens?.length
            ? `Default for ${screens.length} display${screens.length === 1 ? "" : "s"}`
            : "Default for this desk"
        }
        defaultValue={false}
      />
    </Form>
  );
}
