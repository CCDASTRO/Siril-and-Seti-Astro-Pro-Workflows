# CCDASTRO PixInsight Workflow Manager v0.2

This directory contains a native PixInsight JavaScript Runtime (PJSR) workflow
manager for an integrated linear OSC/RGB master.

## v0.2 capabilities

- Ordered checkboxes for gradient correction, SPCC, deblur, denoise, and star
  separation.
- GradientCorrection or GraXpert.
- BlurXTerminator or SyQon Parallax.
- NoiseXTerminator or SyQon Prism/DeepPrism.
- StarXTerminator, StarNet2, or SyQon Starless.
- Main denoise placement before star separation or on the starless branch.
- Independent linked automatic histogram stretches for starless and stars-only
  views.
- Linear-add or nonlinear screen-blend PixelMath recombination.
- Preflight validation for input state, astrometry, installed process classes,
  configured SyQon icons, and branch dependencies.
- Version 2 workflow schema with `main`, `starless`, and `stars` lanes.

The default order is:

1. GradientCorrection or GraXpert
2. SpectrophotometricColorCalibration (SPCC)
3. BlurXTerminator or SyQon Parallax
4. StarXTerminator, StarNet2, or SyQon Starless
5. NoiseXTerminator or SyQon Prism on the starless branch
6. Independent starless and stars stretches
7. PixelMath screen recombination

Deblur runs before the main denoise pass. Gradient correction precedes SPCC,
and SPCC requires a plate-solved image.

## Requirements

- PixInsight 1.8.9-2 or newer; use the newest supported build when possible.
- An integrated, unstretched OSC/RGB master, preferably 32-bit floating-point
  XISF.
- A valid astrometric solution when SPCC is selected.
- The selected third-party processes, applications, models, and licenses.

The preflight validator reports unavailable process classes and missing SyQon
process icons before execution.

## Install in PixInsight

1. Download or clone this repository.
2. Keep the complete `pixinsight` directory in a permanent location.
3. Start PixInsight.
4. Choose **Script > Feature Scripts**.
5. Click **Add**.
6. Select the repository's `pixinsight` directory.
7. Enable recursive search if available and allow the feature scan to finish.
8. Open **Script > CCDASTRO > Workflow Manager**.

This GitHub directory is not a PixInsight Update Manager repository. Do not add
its GitHub URL under **Resources > Updates > Manage Repositories**.

## Configure SyQon choices

SyQon's PixInsight integrations are instantiable scripts that manage external
applications, model files, licenses, temporary files, and output import. The
workflow manager executes configured process icons so those vendor settings are
preserved.

Create these exact process-icon names only for the SyQon tools you plan to use:

| SyQon integration | Required process icon |
| --- | --- |
| Parallax | `CCDASTRO_Parallax` |
| Prism / DeepPrism | `CCDASTRO_Prism` |
| Starless | `CCDASTRO_Starless` |

For each SyQon tool:

1. Install and configure the SyQon application and its PixInsight integration.
2. Open the SyQon script from **Script > SyQon**.
3. Select the executable, model, and desired conservative settings.
4. Disable the SyQon interactive dialog option when available so the icon can
   run unattended.
5. Drag the script's New Instance triangle to the PixInsight workspace.
6. Rename the icon to the exact name in the table above.

For `CCDASTRO_Starless`, enable stars-only generation using **Subtraction**.
Linear inputs should not use Unscreen. The manager verifies that a stars-only
view was created before continuing.

## Run a workflow

1. Open and select the integrated linear master main view.
2. Plate-solve it first if SPCC is enabled.
3. Launch **Script > CCDASTRO > Workflow Manager**.
4. Select the desired tool in each enabled stage.
5. Choose whether denoise runs before separation or on the starless branch.
6. Choose the starless and stars stretch options.
7. Enable automatic recombination if desired.
8. Confirm that the input is an unstretched integrated linear OSC/RGB master.
9. Click **Validate** and resolve every error.
10. Save a copy or confirm that PixInsight swap-file undo is enabled.
11. Click **Run Workflow**.

Progress is written to the PixInsight Process Console. Execution stops at the
first failed stage.

## Starless processing behavior

The deblur stage runs on the complete image while stars are present. When star
separation is enabled, the original target becomes the starless branch and the
generated stars-only view becomes the stars branch.

If starless denoise is selected, only the starless view receives the main
denoise pass. The two views can then be stretched independently. Recombination
uses linear addition when both views remain linear, or PixelMath screen blending
when either automatic stretch is applied.

## Safety and current limitations

- Processing modifies the active view and does not automatically save or clone
  the input.
- Linear state cannot be proven reliably from pixels alone, so explicit user
  confirmation is required.
- The automatic histogram stretch is a starting point, not an aesthetic final
  stretch. Disable it when manual GHS or HistogramTransformation work is desired.
- Native process adapters use conservative defaults. Unrecognized optional
  third-party parameters retain the installed process defaults.
- SyQon choices require correctly named process icons and vendor-side setup.
- If a third-party star-removal tool produces multiple auxiliary views with
  ambiguous names, the manager stops rather than guessing which is stars-only.
- Persisted presets, GHS adapters, checkpoints, and target-specific JSON imports
  remain future work.

## Files

- `CCDASTROWorkflowManager.js` - installable PJSR script.
- `workflows/osc-linear-mvp.json` - version 2 workflow definition.
- `workflows/osc-linear-mvp.schema.json` - JSON Schema.
- `tools/validate-workflow.js` - dependency-free structure/order validator.

Developers with Node.js can validate the supplied workflow with:

```powershell
node pixinsight/tools/validate-workflow.js
```

## Troubleshooting

**A native process says Setup needed.** Install or update that process, restart
PixInsight, reopen the manager, and click Validate.

**A SyQon choice says Setup needed.** Create the required process icon with the
exact name listed above. Confirm that the icon runs successfully by itself.

**SPCC preflight fails.** Run ImageSolver and confirm coordinates, focal length,
pixel size, and observation metadata.

**No stars-only view is detected.** Configure the selected star-removal tool to
generate stars. For SyQon Starless, use Subtraction and rename its process icon
`CCDASTRO_Starless`.
