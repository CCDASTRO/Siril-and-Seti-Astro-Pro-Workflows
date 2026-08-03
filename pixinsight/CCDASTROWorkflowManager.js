/*
 * CCDASTRO Workflow Manager
 * Minimal post-integration workflow runner for PixInsight.
 *
 * Copyright (c) 2026 Chuck Faranda / CCDASTRO, Inc.
 */

#feature-id    Utilities > CCDASTRO Workflow Manager
#feature-info  Configurable OSC post-processing workflow for integrated linear masters.

#include <pjsr/StdButton.jsh>
#include <pjsr/StdIcon.jsh>
#include <pjsr/Sizer.jsh>
#include <pjsr/FrameStyle.jsh>
#include <pjsr/TextAlign.jsh>

#define TITLE "CCDASTRO Workflow Manager"
#define VERSION "0.1.0"

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
   {
      try
      {
         if (eval("typeof " + candidates[i] + " !== 'undefined'"))
            return candidates[i];
      }
      catch (e) {}
   }
   return null;
}

function createProcess(className)
{
   return eval("new " + className + "()");
}

function Adapter(id, label, candidates, configure)
{
   this.id = id;
   this.label = label;
   this.candidates = candidates;
   this.configure = configure || function() {};
}

Adapter.prototype.className = function()
{
   return resolveProcessClass(this.candidates);
};

Adapter.prototype.available = function()
{
   return this.className() !== null;
};

Adapter.prototype.execute = function(view)
{
   var className = this.className();
   if (className === null)
      throw new Error(this.label + " is not installed or is not available to scripts.");

   var process = createProcess(className);
   this.configure(process);
   logLine("Running " + this.label + " on " + view.fullId);
   if (!process.executeOn(view))
      throw new Error(this.label + " did not complete successfully.");
};

var adapters = {
   gradientCorrection: new Adapter(
      "gradientCorrection", "GradientCorrection", ["GradientCorrection"],
      function(p)
      {
         setFirstProperty(p, ["correctionMode", "correction"], 0);
      }),

   graxpert: new Adapter(
      "graxpert", "GraXpert", ["GraXpert", "GraXpertProcess"],
      function(p)
      {
         // Deliberately retain the installed process defaults. GraXpert parameter
         // names have changed between releases; the adapter remains version-safe.
      }),

   spcc: new Adapter(
      "spcc", "SpectrophotometricColorCalibration",
      ["SpectrophotometricColorCalibration"], function(p) {}),

   blurXTerminator: new Adapter(
      "blurXTerminator", "BlurXTerminator", ["BlurXTerminator"],
      function(p)
      {
         setFirstProperty(p, ["correct_only", "correctOnly"], false);
         setFirstProperty(p, ["sharpen_stars", "sharpenStars"], 0.25);
         setFirstProperty(p, ["adjust_halos", "adjustHalos"], 0.00);
         setFirstProperty(p, ["sharpen_nonstellar", "sharpenNonstellar"], 0.50);
      }),

   noiseXTerminator: new Adapter(
      "noiseXTerminator", "NoiseXTerminator", ["NoiseXTerminator"],
      function(p)
      {
         setFirstProperty(p, ["denoise", "Denoise"], 0.75);
         setFirstProperty(p, ["detail", "Detail"], 0.15);
      })
};

function WorkflowStep(id, label, adapterIds, defaultAdapter, note)
{
   this.id = id;
   this.label = label;
   this.adapterIds = adapterIds;
   this.defaultAdapter = defaultAdapter;
   this.note = note;
   this.enabled = true;
   this.selectedAdapter = defaultAdapter;
}

function defaultWorkflow()
{
   return [
      new WorkflowStep("gradient", "1. Gradient correction",
         ["gradientCorrection", "graxpert"], "gradientCorrection",
         "Runs before color calibration."),
      new WorkflowStep("colorCalibration", "2. Color calibration",
         ["spcc"], "spcc", "Requires a solved color image."),
      new WorkflowStep("deconvolution", "3. Deconvolution / optical correction",
         ["blurXTerminator"], "blurXTerminator",
         "Runs on linear data before denoising, with stars present."),
      new WorkflowStep("linearDenoise", "4. Linear noise reduction",
         ["noiseXTerminator"], "noiseXTerminator",
         "Runs after BlurXTerminator.")
   ];
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
      result.errors.push("This MVP expects an OSC/RGB color master.");

   var anyEnabled = false;
   for (var i = 0; i < this.dialog.rows.length; ++i)
   {
      var row = this.dialog.rows[i];
      if (!row.enabled.checked)
         continue;
      anyEnabled = true;
      var adapter = adapters[row.adapterId()];
      if (!adapter || !adapter.available())
         result.errors.push(row.step.label + ": selected process is not installed (" +
                            (adapter ? adapter.label : row.adapterId()) + ").");
   }
   if (!anyEnabled)
      result.errors.push("Select at least one processing step.");

   if (this.dialog.rows[1].enabled.checked)
   {
      try
      {
         if (propertyExists(window, "hasAstrometricSolution") &&
             !window.hasAstrometricSolution)
            result.errors.push("SPCC requires an astrometric solution. Plate-solve the image first.");
      }
      catch (e)
      {
         result.warnings.push("Could not verify the astrometric solution; SPCC may stop for missing metadata.");
      }
   }

   if (!this.dialog.rows[2].enabled.checked && this.dialog.rows[3].enabled.checked)
      result.warnings.push("NoiseXTerminator is enabled without BlurXTerminator. This is valid only if deconvolution was already completed.");

   result.warnings.push("The script modifies the active view. Save a copy or enable PixInsight swap-file undo before running.");
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
   this.status.minWidth = 90;
   this.status.textAlignment = TextAlign_Right | TextAlign_VertCenter;

   this.adapterId = function()
   {
      return this.step.adapterIds[this.choice.currentItem];
   };

   this.refreshStatus = function()
   {
      var adapter = adapters[this.adapterId()];
      this.status.text = adapter.available() ? "Available" : "Not installed";
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

function WorkflowDialog()
{
   this.__base__ = Dialog;
   this.__base__();

   this.windowTitle = TITLE + " " + VERSION;
   this.minWidth = 720;

   this.title = new Label(this);
   this.title.useRichText = true;
   this.title.text = "<b>OSC Linear Post-Processing Workflow</b>";

   this.help = new Label(this);
   this.help.wordWrapping = true;
   this.help.text = "Select an integrated linear OSC master as the active image. " +
      "Choose the desired steps and a gradient implementation, validate, then run. " +
      "Steps execute in the scientifically constrained order shown below.";

   this.inputLabel = new Label(this);
   this.inputLabel.frameStyle = FrameStyle_Box;
   this.inputLabel.margin = 6;
   this.inputLabel.text = "Active view: " +
      (ImageWindow.activeWindow.isNull ? "<none>" : ImageWindow.activeWindow.currentView.fullId);

   this.linearConfirmation = new CheckBox(this);
   this.linearConfirmation.text = "I confirm this is an unstretched, integrated linear OSC/RGB master";
   this.linearConfirmation.checked = false;

   this.stepsBox = new GroupBox(this);
   this.stepsBox.title = "Workflow";
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

   this.statusBox = new GroupBox(this);
   this.statusBox.title = "Status";
   this.statusText = new Label(this);
   this.statusText.wordWrapping = true;
   this.statusText.minHeight = 70;
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

      var confirmation = new MessageBox(
         resultText(result) + "\n\nRun the selected workflow on the active view?",
         TITLE, StdIcon_Warning, StdButton_Yes, StdButton_No);
      if (confirmation.execute() !== StdButton_Yes)
         return;

      Console.show();
      var view = ImageWindow.activeWindow.currentView;
      self.enabled = false;
      try
      {
         for (var i = 0; i < self.rows.length; ++i)
         {
            var row = self.rows[i];
            if (!row.enabled.checked)
               continue;
            adapters[row.adapterId()].execute(view);
            processEvents();
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
      finally
      {
         self.enabled = true;
      }
   };

   this.closeButton.onClick = function() { self.cancel(); };
   this.adjustToContents();
   this.setFixedWidth(this.width);
}

WorkflowDialog.prototype = new Dialog;

function main()
{
   Console.hide();
   var dialog = new WorkflowDialog;
   dialog.execute();
}

main();
