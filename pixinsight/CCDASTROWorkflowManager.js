/*
 * CCDASTRO Workflow Manager
 * Configurable post-integration workflow runner for PixInsight.
 *
 * Copyright (c) 2026 Chuck Faranda / CCDASTRO, Inc.
 */

#feature-id    CCDASTRO > Workflow Manager
#feature-info  Configurable OSC post-processing workflow with starless branch support.

#include <pjsr/StdButton.jsh>
#include <pjsr/StdIcon.jsh>
#include <pjsr/Sizer.jsh>
#include <pjsr/FrameStyle.jsh>
#include <pjsr/TextAlign.jsh>

#define TITLE "CCDASTRO Workflow Manager"
#define VERSION "0.3.0"

var SYQON_PARALLAX_ICON = "CCDASTRO_Parallax";
var SYQON_PRISM_ICON = "CCDASTRO_Prism";
var SYQON_STARLESS_ICON = "CCDASTRO_Starless";

function logLine(text)
{
   Console.writeln("<end><cbr><b>[CCDASTRO]</b> " + text);
}

function propertyExists(object, name)
{
   try { return name in object; } catch (e) { return false; }
}

function setFirstProperty(process, names, value)
{
   for (var i = 0; i < names.length; ++i)
      if (propertyExists(process, names[i]))
      {
         process[names[i]] = value;
         return names[i];
      }
   return null;
}

function resolveProcessClass(candidates)
{
   for (var i = 0; i < candidates.length; ++i)
      try
      {
         if (eval("typeof " + candidates[i] + " !== 'undefined'"))
            return candidates[i];
      }
      catch (e) {}
   return null;
}

function createProcess(className)
{
   return eval("new " + className + "()");
}

function ProcessAdapter(id, label, candidates, configure)
{
   this.id = id;
   this.label = label;
   this.candidates = candidates;
   this.configure = configure || function() {};
}

ProcessAdapter.prototype.className = function()
{
   return resolveProcessClass(this.candidates);
};

ProcessAdapter.prototype.available = function()
{
   return this.className() !== null;
};

ProcessAdapter.prototype.requirement = function()
{
   return "Install the " + this.label + " PixInsight process.";
};

ProcessAdapter.prototype.execute = function(view)
{
   var className = this.className();
   if (className === null)
      throw new Error(this.label + " is not installed or is unavailable to scripts.");
   var process = createProcess(className);
   this.configure(process);
   logLine("Running " + this.label + " on " + view.fullId);
   if (!process.executeOn(view))
      throw new Error(this.label + " did not complete successfully.");
};

function ProcessIconAdapter(id, label, iconId)
{
   this.id = id;
   this.label = label;
   this.iconId = iconId;
}

ProcessIconAdapter.prototype.available = function()
{
   try { return ProcessInstance.icons().indexOf(this.iconId) >= 0; }
   catch (e) { return false; }
};

ProcessIconAdapter.prototype.requirement = function()
{
   return "Create and configure the PixInsight process icon '" + this.iconId + "'.";
};

ProcessIconAdapter.prototype.execute = function(view)
{
   if (!this.available())
      throw new Error(this.requirement());
   var process = ProcessInstance.fromIcon(this.iconId);
   if (process === null)
      throw new Error("Could not load process icon " + this.iconId + ".");
   logLine("Running " + this.label + " process icon on " + view.fullId);
   if (!process.executeOn(view))
      throw new Error(this.label + " did not complete successfully.");
};

var adapters = {
   gradientCorrection: new ProcessAdapter(
      "gradientCorrection", "GradientCorrection", ["GradientCorrection"], function(p)
      {
         setFirstProperty(p, ["generateGradientModel"], false);
      }),

   graxpert: new ProcessAdapter(
      "graxpert", "GraXpert", ["GraXpert", "GraXpertProcess"], function(p) {}),

   spcc: new ProcessAdapter(
      "spcc", "SpectrophotometricColorCalibration",
      ["SpectrophotometricColorCalibration"], function(p)
      {
         setFirstProperty(p, ["applyCalibration"], true);
         setFirstProperty(p, ["catalogId"], "GaiaDR3SP");
         setFirstProperty(p, ["autoLimitMagnitude"], true);
      }),

   blurXTerminator: new ProcessAdapter(
      "blurXTerminator", "BlurXTerminator", ["BlurXTerminator"], function(p)
      {
         setFirstProperty(p, ["nonstellar_then_stellar"], false);
         setFirstProperty(p, ["sharpen_stars", "sharpenStars"], 0.25);
         setFirstProperty(p, ["adjust_halos", "adjustHalos"], 0.00);
         setFirstProperty(p, ["auto_nonstellar_psf"], true);
         setFirstProperty(p, ["sharpen_nonstellar", "sharpenNonstellar"], 0.50);
      }),

   syqonParallax: new ProcessIconAdapter(
      "syqonParallax", "SyQon Parallax", SYQON_PARALLAX_ICON),

   noiseXTerminator: new ProcessAdapter(
      "noiseXTerminator", "NoiseXTerminator", ["NoiseXTerminator"], function(p)
      {
         setFirstProperty(p, ["denoise"], 0.75);
         setFirstProperty(p, ["detail"], 0.15);
         setFirstProperty(p, ["iterations"], 2);
      }),

   syqonPrism: new ProcessIconAdapter(
      "syqonPrism", "SyQon Prism / DeepPrism", SYQON_PRISM_ICON),

   starXTerminator: new ProcessAdapter(
      "starXTerminator", "StarXTerminator", ["StarXTerminator"], function(p)
      {
         setFirstProperty(p, ["stars"], true);
         setFirstProperty(p, ["unscreen"], false);
      }),

   starNet2: new ProcessAdapter(
      "starNet2", "StarNet2", ["StarNet2"], function(p)
      {
         setFirstProperty(p, ["mask"], true);
         setFirstProperty(p, ["linear"], true);
      }),

   syqonStarless: new ProcessIconAdapter(
      "syqonStarless", "SyQon Starless", SYQON_STARLESS_ICON)
};

function WorkflowStep(id, label, adapterIds, defaultAdapter, note)
{
   this.id = id;
   this.label = label;
   this.adapterIds = adapterIds;
   this.defaultAdapter = defaultAdapter;
   this.note = note;
   this.enabled = true;
}

function defaultWorkflow()
{
   return [
      new WorkflowStep("gradient", "1. Gradient correction",
         ["gradientCorrection", "graxpert"], "gradientCorrection",
         "Runs before color calibration."),
      new WorkflowStep("colorCalibration", "2. Color calibration",
         ["spcc"], "spcc", "SPCC requires a solved color image."),
      new WorkflowStep("deconvolution", "3. Deblur / structure recovery",
         ["blurXTerminator", "syqonParallax"], "blurXTerminator",
         "Runs on linear data before the main denoise pass."),
      new WorkflowStep("noiseReduction", "4. Noise reduction",
         ["noiseXTerminator", "syqonPrism"], "noiseXTerminator",
         "Can run before separation or on the starless branch."),
      new WorkflowStep("starSeparation", "5. Star separation",
         ["starXTerminator", "starNet2", "syqonStarless"], "starXTerminator",
         "Creates starless and stars-only workflow branches.")
   ];
}

function imageWindowsSnapshot()
{
   var snapshot = {};
   var windows = ImageWindow.windows;
   for (var i = 0; i < windows.length; ++i)
      snapshot[windows[i].mainView.fullId] = true;
   return snapshot;
}

function newWindowsSince(snapshot, targetWindow)
{
   var found = [];
   var windows = ImageWindow.windows;
   for (var i = 0; i < windows.length; ++i)
      if (windows[i] !== targetWindow && !snapshot[windows[i].mainView.fullId])
         found.push(windows[i]);
   return found;
}

function chooseStarsWindow(windows)
{
   for (var i = 0; i < windows.length; ++i)
      if (windows[i].mainView.id.toLowerCase().indexOf("star") >= 0)
         return windows[i];
   return windows.length === 1 ? windows[0] : null;
}

function executeStarSeparation(adapter, targetView)
{
   var targetWindow = targetView.window;
   var before = imageWindowsSnapshot();
   adapter.execute(targetView);
   processEvents();
   var created = newWindowsSince(before, targetWindow);
   var starsWindow = chooseStarsWindow(created);
   if (starsWindow === null)
      throw new Error(adapter.label + " did not create an identifiable stars-only view. " +
         "For SyQon Starless, configure the process icon to generate stars by Subtraction.");
   logLine("Starless branch: " + targetWindow.mainView.fullId);
   logLine("Stars branch: " + starsWindow.mainView.fullId);
   return { starlessView: targetWindow.mainView, starsView: starsWindow.mainView };
}

function applyLinkedAutoHistogram(view, targetBackground)
{
   var median = view.computeOrFetchProperty("Median");
   var mad = view.computeOrFetchProperty("MAD");
   mad.mul(1.4826);
   var channels = view.image.isColor ? 3 : 1;
   var shadows = 0;
   var center = 0;
   for (var c = 0; c < channels; ++c)
   {
      shadows += median.at(c) - 2.8*mad.at(c);
      center += median.at(c);
   }
   shadows = Math.range(shadows/channels, 0.0, 1.0);
   center /= channels;
   if (center <= shadows || center >= 1)
      throw new Error("Cannot calculate a safe automatic stretch for " + view.fullId + ".");
   var midtones = Math.mtf(targetBackground, center - shadows);
   var row = [shadows, midtones, 1.0, 0.0, 1.0];
   var process = new HistogramTransformation;
   process.H = [row, row, row, [0, 0.5, 1, 0, 1], [0, 0.5, 1, 0, 1]];
   logLine("Applying linked automatic histogram stretch to " + view.fullId);
   if (!process.executeOn(view))
      throw new Error("Histogram stretch failed on " + view.fullId + ".");
};

function recombineScreen(starlessView, starsView, nonlinear)
{
   if (starlessView.image.width !== starsView.image.width ||
       starlessView.image.height !== starsView.image.height)
      throw new Error("Starless and stars views have incompatible dimensions.");
   var process = new PixelMath;
   process.useSingleExpression = true;
   process.createNewImage = false;
   process.rescale = false;
   process.truncate = false;
   process.symbols = "";
   process.expression = nonlinear
      ? "$T + " + starsView.fullId + " - $T*" + starsView.fullId
      : "$T + " + starsView.fullId;
   logLine("Recombining stars into " + starlessView.fullId +
      (nonlinear ? " with screen blending" : " with linear addition"));
   if (!process.executeOn(starlessView))
      throw new Error("Star recombination failed.");
}

function PreflightResult()
{
   this.errors = [];
   this.warnings = [];
}

PreflightResult.prototype.ok = function()
{
   return this.errors.length === 0;
};

function PreflightValidator(dialog)
{
   this.dialog = dialog;
}

PreflightValidator.prototype.validate = function()
{
   var result = new PreflightResult;
   var window = ImageWindow.activeWindow;
   if (window.isNull)
   {
      result.errors.push("Open and select an integrated master image.");
      return result;
   }
   var view = window.currentView;
   if (view.isNull)
      result.errors.push("The active image has no usable current view.");
   else if (view.isPreview)
      result.errors.push("Select the main image view, not a preview.");
   if (!this.dialog.linearConfirmation.checked)
      result.errors.push("Confirm that the input is an unstretched linear integrated master.");
   if (!window.mainView.image.isColor)
      result.errors.push("This workflow expects an OSC/RGB color master.");

   var anyEnabled = false;
   for (var i = 0; i < this.dialog.rows.length; ++i)
   {
      var row = this.dialog.rows[i];
      if (!row.enabled.checked)
         continue;
      anyEnabled = true;
      var adapter = adapters[row.adapterId()];
      if (!adapter || !adapter.available())
         result.errors.push(row.step.label + ": " +
            (adapter ? adapter.requirement() : "Unknown adapter."));
   }
   if (!anyEnabled)
      result.errors.push("Select at least one processing step.");

   if (this.dialog.rows[1].enabled.checked &&
       propertyExists(window, "hasAstrometricSolution") &&
       !window.hasAstrometricSolution)
      result.errors.push("SPCC requires an astrometric solution. Plate-solve the image first.");

   var separationEnabled = this.dialog.rows[4].enabled.checked;
   if (this.dialog.noisePlacement.currentItem === 1 &&
       this.dialog.rows[3].enabled.checked && !separationEnabled)
      result.errors.push("Starless-branch denoise requires star separation.");
   if ((this.dialog.starlessStretch.currentItem > 0 ||
        this.dialog.starsStretch.currentItem > 0 ||
        this.dialog.recombine.checked) && !separationEnabled)
      result.errors.push("Branch stretching and recombination require star separation.");
   if (!this.dialog.rows[2].enabled.checked && this.dialog.rows[3].enabled.checked &&
       this.dialog.noisePlacement.currentItem === 0)
      result.warnings.push("Noise reduction is enabled before separation without a deblur step. " +
         "Use this only if deconvolution was already completed.");

   result.warnings.push("The workflow modifies the active view. Save a copy or enable swap-file undo.");
   return result;
};

function resultText(result)
{
   var text = result.ok() ? "Preflight passed." : "Preflight failed.";
   if (result.errors.length)
      text += "\n\nErrors:\n- " + result.errors.join("\n- ");
   if (result.warnings.length)
      text += "\n\nWarnings:\n- " + result.warnings.join("\n- ");
   return text;
}

function WorkflowRow(parent, step)
{
   this.step = step;
   this.enabled = new CheckBox(parent);
   this.enabled.text = step.label;
   this.enabled.checked = step.enabled;
   this.enabled.toolTip = step.note;
   this.enabled.minWidth = 280;
   this.choice = new ComboBox(parent);
   this.choice.minWidth = 235;
   for (var i = 0; i < step.adapterIds.length; ++i)
   {
      var adapter = adapters[step.adapterIds[i]];
      this.choice.addItem(adapter.label);
      if (step.adapterIds[i] === step.defaultAdapter)
         this.choice.currentItem = i;
   }
   this.status = new Label(parent);
   this.status.minWidth = 110;
   this.status.textAlignment = TextAlign_Right | TextAlign_VertCenter;
   this.adapterId = function() { return this.step.adapterIds[this.choice.currentItem]; };
   this.refreshStatus = function()
   {
      this.status.text = adapters[this.adapterId()].available() ? "Available" : "Setup needed";
   };
   this.sizer = new HorizontalSizer;
   this.sizer.spacing = 8;
   this.sizer.add(this.enabled, 100);
   this.sizer.add(this.choice);
   this.sizer.add(this.status);
   this.refreshStatus();
   var self = this;
   this.choice.onItemSelected = function() { self.refreshStatus(); };
}

function labeledCombo(parent, label, items, selected)
{
   var control = {};
   control.label = new Label(parent);
   control.label.text = label;
   control.label.minWidth = 210;
   control.label.textAlignment = TextAlign_Right | TextAlign_VertCenter;
   control.combo = new ComboBox(parent);
   control.combo.minWidth = 260;
   for (var i = 0; i < items.length; ++i)
      control.combo.addItem(items[i]);
   control.combo.currentItem = selected;
   control.sizer = new HorizontalSizer;
   control.sizer.spacing = 8;
   control.sizer.add(control.label);
   control.sizer.add(control.combo, 100);
   return control;
}

function WorkflowDialog()
{
   this.__base__ = Dialog;
   this.__base__();
   this.windowTitle = TITLE + " " + VERSION;
   this.minWidth = 760;

   this.title = new Label(this);
   this.title.useRichText = true;
   this.title.text = "<b>OSC Post-Processing Workflow v" + VERSION + "</b>";
   this.help = new Label(this);
   this.help.wordWrapping = true;
   this.help.text = "Choose the desired tools and whether the main denoise pass runs before " +
      "star separation or on the starless branch. SyQon choices use configured process icons.";
   this.inputLabel = new Label(this);
   this.inputLabel.frameStyle = FrameStyle_Box;
   this.inputLabel.margin = 6;
   this.inputLabel.text = "Active view: " +
      (ImageWindow.activeWindow.isNull ? "<none>" : ImageWindow.activeWindow.currentView.fullId);
   this.linearConfirmation = new CheckBox(this);
   this.linearConfirmation.text = "I confirm this is an unstretched, integrated linear OSC/RGB master";

   this.stepsBox = new GroupBox(this);
   this.stepsBox.title = "Linear workflow";
   this.stepsBox.sizer = new VerticalSizer;
   this.stepsBox.sizer.margin = 8;
   this.stepsBox.sizer.spacing = 6;
   this.rows = [];
   var workflow = defaultWorkflow();
   for (var i = 0; i < workflow.length; ++i)
   {
      var row = new WorkflowRow(this, workflow[i]);
      this.rows.push(row);
      this.stepsBox.sizer.add(row.sizer);
   }

   var noisePlacementControl = labeledCombo(this, "Noise placement:",
      ["Before star separation", "Starless branch"], 1);
   this.noisePlacement = noisePlacementControl.combo;
   this.stepsBox.sizer.add(noisePlacementControl.sizer);

   this.branchesBox = new GroupBox(this);
   this.branchesBox.title = "Starless / stars branches";
   this.branchesBox.sizer = new VerticalSizer;
   this.branchesBox.sizer.margin = 8;
   this.branchesBox.sizer.spacing = 6;
   var starlessStretchControl = labeledCombo(this, "Starless stretch:",
      ["Keep linear", "Linked Auto Histogram"], 1);
   this.starlessStretch = starlessStretchControl.combo;
   var starsStretchControl = labeledCombo(this, "Stars stretch:",
      ["Keep linear", "Gentle Linked Auto Histogram"], 1);
   this.starsStretch = starsStretchControl.combo;
   this.recombine = new CheckBox(this);
   this.recombine.text = "Recombine branches automatically (screen blend after stretching)";
   this.recombine.checked = true;
   this.branchesBox.sizer.add(starlessStretchControl.sizer);
   this.branchesBox.sizer.add(starsStretchControl.sizer);
   this.branchesBox.sizer.add(this.recombine);

   this.statusBox = new GroupBox(this);
   this.statusBox.title = "Status";
   this.statusText = new Label(this);
   this.statusText.wordWrapping = true;
   this.statusText.minHeight = 75;
   this.statusText.text = "Ready for preflight validation.";
   this.statusBox.sizer = new VerticalSizer;
   this.statusBox.sizer.margin = 8;
   this.statusBox.sizer.add(this.statusText);

   this.validateButton = new PushButton(this);
   this.validateButton.text = "Validate";
   this.validateButton.icon = this.scaledResource(":/icons/check.png");
   this.runButton = new PushButton(this);
   this.runButton.text = "Run Workflow";
   this.runButton.icon = this.scaledResource(":/icons/play.png");
   this.closeButton = new PushButton(this);
   this.closeButton.text = "Close";
   this.closeButton.icon = this.scaledResource(":/icons/close.png");
   this.buttonSizer = new HorizontalSizer;
   this.buttonSizer.spacing = 8;
   this.buttonSizer.addStretch();
   this.buttonSizer.add(this.validateButton);
   this.buttonSizer.add(this.runButton);
   this.buttonSizer.add(this.closeButton);

   this.sizer = new VerticalSizer;
   this.sizer.margin = 10;
   this.sizer.spacing = 10;
   this.sizer.add(this.title);
   this.sizer.add(this.help);
   this.sizer.add(this.inputLabel);
   this.sizer.add(this.linearConfirmation);
   this.sizer.add(this.stepsBox);
   this.sizer.add(this.branchesBox);
   this.sizer.add(this.statusBox);
   this.sizer.add(this.buttonSizer);

   var self = this;
   this.validateButton.onClick = function()
   {
      for (var i = 0; i < self.rows.length; ++i)
         self.rows[i].refreshStatus();
      var result = new PreflightValidator(self).validate();
      self.statusText.text = resultText(result);
      (new MessageBox(resultText(result), TITLE,
         result.ok() ? StdIcon_Information : StdIcon_Error, StdButton_Ok)).execute();
   };

   this.runButton.onClick = function()
   {
      var result = new PreflightValidator(self).validate();
      self.statusText.text = resultText(result);
      if (!result.ok())
      {
         (new MessageBox(resultText(result), TITLE, StdIcon_Error, StdButton_Ok)).execute();
         return;
      }
      if ((new MessageBox(resultText(result) + "\n\nRun on the active view?", TITLE,
          StdIcon_Warning, StdButton_Yes, StdButton_No)).execute() !== StdButton_Yes)
         return;

      Console.show();
      self.enabled = false;
      try
      {
         var view = ImageWindow.activeWindow.currentView;
         for (var i = 0; i <= 2; ++i)
            if (self.rows[i].enabled.checked)
               adapters[self.rows[i].adapterId()].execute(view);

         if (self.rows[3].enabled.checked && self.noisePlacement.currentItem === 0)
            adapters[self.rows[3].adapterId()].execute(view);

         var branches = null;
         if (self.rows[4].enabled.checked)
            branches = executeStarSeparation(adapters[self.rows[4].adapterId()], view);

         if (branches !== null)
         {
            if (self.rows[3].enabled.checked && self.noisePlacement.currentItem === 1)
               adapters[self.rows[3].adapterId()].execute(branches.starlessView);
            var nonlinear = false;
            if (self.starlessStretch.currentItem > 0)
            {
               applyLinkedAutoHistogram(branches.starlessView, 0.25);
               nonlinear = true;
            }
            if (self.starsStretch.currentItem > 0)
            {
               applyLinkedAutoHistogram(branches.starsView, 0.35);
               nonlinear = true;
            }
            if (self.recombine.checked)
               recombineScreen(branches.starlessView, branches.starsView, nonlinear);
         }

         self.statusText.text = "Workflow completed successfully.";
         logLine("Workflow completed successfully.");
         (new MessageBox("Workflow completed successfully.", TITLE,
            StdIcon_Information, StdButton_Ok)).execute();
      }
      catch (e)
      {
         var message = "Workflow stopped: " + e.message;
         self.statusText.text = message;
         Console.criticalln("<end><cbr><b>[CCDASTRO] " + message + "</b>");
         (new MessageBox(message, TITLE, StdIcon_Error, StdButton_Ok)).execute();
      }
      finally { self.enabled = true; }
   };

   this.closeButton.onClick = function() { self.cancel(); };
   this.adjustToContents();
   this.setFixedWidth(this.width);
}

WorkflowDialog.prototype = new Dialog;

function main()
{
   Console.hide();
   (new WorkflowDialog).execute();
}

main();
