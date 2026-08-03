# CCDASTRO PixInsight Workflow Manager

This directory contains the first PixInsight MVP for running a selectable,
scientifically ordered workflow on an integrated linear OSC/RGB master.

## Included in the MVP

- A native PixInsight JavaScript Runtime (PJSR) dialog.
- Checkboxes for enabling or skipping each processing stage.
- A swap-in choice between PixInsight GradientCorrection and GraXpert.
- Executable adapters for GradientCorrection, GraXpert, SPCC,
  BlurXTerminator, and NoiseXTerminator.
- Preflight checks for an active main view, RGB input, user-confirmed linear
  state, SPCC astrometric solution, process availability, and basic ordering.
- A versioned workflow document and JSON Schema for future presets.

The MVP executes the following fixed order:

1. GradientCorrection or GraXpert
2. SpectrophotometricColorCalibration (SPCC)
3. BlurXTerminator
4. NoiseXTerminator

The order is intentionally fixed. BlurXTerminator must receive linear data and
must precede noise reduction. SPCC follows gradient correction and requires a
plate-solved image.

## Requirements

- PixInsight 1.8.9-2 or newer; use the newest supported build when possible.
- An integrated, unstretched OSC/RGB master, preferably 32-bit floating-point
  XISF.
- A valid astrometric solution when SPCC is selected.
- The desired third-party processes installed and licensed:
  - GraXpert Process for the GraXpert choice.
  - BlurXTerminator and NoiseXTerminator from RC Astro.

The built-in GradientCorrection process may require a newer PixInsight build.
The preflight validator reports unavailable process classes before execution.

## Install in PixInsight

1. Download or clone this repository.
2. Keep the complete `pixinsight` directory in a permanent location. Do not
   install it from a temporary or Downloads directory that may later move.
3. Start PixInsight.
4. Choose **Script > Feature Scripts**.
5. Click **Add**.
6. Select the repository's `pixinsight` directory.
7. Enable recursive search if PixInsight offers that option, then allow the
   feature scan to finish.
8. Open **Script > CCDASTRO > Workflow Manager**.

If the script does not appear, remove and re-add the search path, then inspect
the PixInsight Process Console for a script parsing or signature message.

### Optional process installation

Install third-party processes through PixInsight's update system:

1. Choose **Resources > Updates > Manage Repositories**.
2. Add the repository URL supplied by the process vendor.
3. Choose **Resources > Updates > Check for Updates**.
4. Apply updates and restart PixInsight.

For GraXpert Process, use the current repository address published by
DeepSkyForge. For the XTerminator products, use the current repository addresses
published by RC Astro. Vendor URLs can change, so follow their current install
pages instead of copying an old URL from a workflow file.

## Run a workflow

1. Open the integrated linear master.
2. If using SPCC, plate-solve it first and make sure acquisition metadata is
   correct.
3. Select the master image's main view. Do not select a preview.
4. Launch **Script > CCDASTRO > Workflow Manager**.
5. Check the desired stages and choose GradientCorrection or GraXpert.
6. Confirm that the input is an unstretched linear OSC/RGB master.
7. Click **Validate** and resolve every reported error.
8. Save a copy or confirm that PixInsight's swap-file undo data is enabled.
9. Click **Run Workflow** and confirm execution.

The script writes progress to the PixInsight Process Console. If a process
fails, execution stops immediately and later stages are not run.

## Safety and current limitations

- Processing is applied to the active view. The MVP does not automatically
  duplicate or save the input image.
- The linear state cannot be proven reliably from pixels alone, so it requires
  explicit user confirmation.
- Adapters use conservative defaults. Because third-party parameter identifiers
  can change, optional settings are only assigned when the installed process
  exposes a recognized property; otherwise the process's installed defaults are
  retained.
- The JSON workflow is the versioned contract for the next iteration. The MVP
  dialog currently embeds the same four stages so it remains a single-file,
  easily installed PixInsight script.
- Star separation, branching, stretching, checkpoints, persisted presets, and
  target-specific workflow imports are planned for later releases.

## Files

- `CCDASTROWorkflowManager.js` — installable PJSR script and executable MVP.
- `workflows/osc-linear-mvp.json` — versioned workflow definition.
- `workflows/osc-linear-mvp.schema.json` — JSON Schema for workflow files.
- `tools/validate-workflow.js` — dependency-free structural and ordering check.

Developers with Node.js installed can validate the supplied workflow with:

```powershell
node pixinsight/tools/validate-workflow.js
```

## Troubleshooting

**A process says “Not installed.”** Install or update that process, restart
PixInsight, reopen the manager, and click Validate.

**SPCC preflight fails.** Run ImageSolver on the master first. Confirm that the
image has coordinates, focal length, pixel size, and observation metadata.

**A third-party process starts but rejects its parameters.** Open that process
manually once to verify its installation, model files, license, and default
settings. The manager intentionally falls back to vendor defaults when it does
not recognize a version-specific parameter property.
