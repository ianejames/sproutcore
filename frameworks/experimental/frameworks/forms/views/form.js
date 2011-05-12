// ==========================================================================
// Project:   SproutCore - JavaScript Application Framework
// Copyright: ©2009 Alex Iskander and TPSi
//            Portions ©2008-2011 Apple Inc. All rights reserved.
// License:   Licensed under MIT license (see license.js)
// ==========================================================================
/*globals Forms */

sc_require("mixins/emptiness");
sc_require("mixins/edit_mode");
sc_require("views/form_row");

/** 
  @class

  FormView is a lot like a normal view. However, in addition to the childViews
  collection, it has a fields collection. The items referenced here are NOT
  just children; they are explicity stated in the array fields, which works
  just like childViews, but marks fields to be laid out automatically.

  Usually, you will place rows into the FormView:
  
      childViews: "fullName gender".w(),
      contentBinding: 'MyApp.personController',

      fullName: SC.FormView.row("Name:", SC.TextFieldView.extend({
        layout: {height: 20, width: 150}
      })),

      gender: SC.FormView.row("Gender:", SC.RadioView.design({
        layout: {width: 150, height: 40, centerY: 0},
        items: ["male", "female"]
      }))

  The name of the row (ie. 'fullName'), is passed down to the *FieldView, and used as the key
  to bind the value property to the content. In this case it will bind content.fullName to the
  value property of the textFieldView. Easy!

  One important thing about the field collection: It can contain any type of
  view, including other FormViews or subclasses of FormView.

  This is important, because this is how you make nice rows that have a
  label and a field: these rows are actually subclasses of FormView itself.

  Editing
  -------
  
  The form does not allow editing by default; editing must be started by calling
  beginEditing.


  @extends SC.View
  @implements SC.FlowedLayout, SC.CalculatesEmptiness, SC.FormsEditMode
*/

SC.FormView = SC.View.extend(SC.FlowedLayout, SC.CalculatesEmptiness, SC.FormsEditMode, /** @scope SC.FormView.prototype */ {
  // We lay out forms vertically. Each item gets its own "row". Wrapping makes
  // no sense, as the FormView should grow with each row.
  layoutDirection: SC.LAYOUT_VERTICAL,
  canWrap: NO,

  renderDelegateName: 'formRenderDelegate',

  /**
    The default padding around items in the form. By default, this comes from the theme.
    You can supply your own directly, or override the formRenderDelegate:

        // base it on the existing render delegate
        MyTheme.formRenderDelegate = SC.AceTheme.formRenderDelegate.create({
          flowSpacing: { left: 5, top: 5, right: 5, bottom: 5 }
        });
  */
  defaultFlowSpacing: SC.propertyFromRenderDelegate('flowSpacing', {}),

  classNames: ["sc-form-view"],

  /**
    Whether to automatically start editing.
  */
  editsByDefault: YES,

  /**
    The input key view (to set previousKeyView for the first row, field, or sub-form).

    For fields, this will likely be the field itself.
  */
  firstKeyView: null,

  /**
    The output key view.
  */
  lastKeyView: null,

  /**
    The content to bind the form to. This content object is passed to all children.
  
    All child views, if added at design time via string-based childViews array, will get their
    contentValueKey set to their own key. Note that SC.RowView passes on its contentValueKey to its
    child field, and if its isNested property is YES, uses it to find its own content object.
  */
  content: null,
  
  /**
    Rows in the form do not have to be full SC.FormRowView at design time. They can also be hashes
    that get loaded into rows.
  */
  exampleRow: SC.FormRowView.extend({
    labelView: SC.FormRowView.LabelView.extend({ textAlign: SC.ALIGN_RIGHT })
  }),

  /**
     @private
  */
  init: function()
  {
    if (this.get("editsByDefault")) this.set("isEditing", YES);
    sc_super();
  },

  /**
  */
  createChildViews: function()
  {
    var cv = SC.clone(this.get("childViews"));
    var idx, len = cv.length, key, v, exampleRow = this.get("exampleRow");

    // rows that are provided as plain hashes need to be created by passing them into
    // exampleRow.extend.
    for (idx = 0; idx < len; idx++) {
      key = cv[idx];
      if (SC.typeOf(key) === SC.T_STRING) {
        v = this.get(key);
        if (v && !v.isClass && SC.typeOf(v) === SC.T_HASH) {
          this[key] = exampleRow.extend(v);
        }
      }
    }

    // a childView named 'myField' will want a contentValueKey 'myField' so it knows what
    // property to grab from its content.
    for (idx = 0; idx < len; idx++) {
      key = cv[idx];
      if (SC.typeOf(key) === SC.T_STRING) {
        v = this.get(key);
        if (v.isClass && v.prototype.hasContentValueSupport && !v.prototype.contentValueKey){
          v.prototype.contentValueKey = key ;
        } else if(v.isClass) {
          v.prototype.formKey = key;
        }
      }
    }

    // we will be initializing the 'content' property for all child views
    var content = this.get("content");
    sc_super();

    for (idx = 0; idx < len; idx++) {
      key = cv[idx];

      // if the view was originally declared as a string, then we have something to give it
      if (SC.typeOf(key) === SC.T_STRING) {
        // try to get the actual view
        v = this.get(key);

        // see if it does indeed exist, and if it doesn't have a value already
        if (v && !v.isClass && v.hasContentValueSupport) {
          // set content
          if (!v.get("content")) {

            if (v.get('hasContentValueSupport')) {
              // controls can calculate their own value based on the contentValueKey we set earlier
              v.bind('content', '.owner.content');

            } else {
              // if it isn't a control then we can't use contentValueKey, so bind the content manually
              v.bind('content', '.owner.content.' + key);
            }
          }

          // set the label size measuring stuff
          if (this.get('labelWidth') !== null) {
            v.set("shouldMeasureLabel", NO);
          }

          // set label (if possible)
          if (v.get("isFormRow") && SC.none(v.get("label"))) {
            v.set("label", key.humanize().titleize());
          }
        }
      }
    }

    this._hasCreatedRows = YES;
    this.recalculateLabelWidth();
  },

  
  /**
    Allows rows to use this to track label width.
  */
  isRowDelegate: YES,
  
  /**
    Supply a label width to avoid automatically calculating the widths of the labels
    in the form. Leave null to let SproutCore automatically determine the proper width
    for the label.

    @type Number
    @default null
  */
  labelWidth: null,
  
  /**
    Tells the child rows whether they should measure their labels or not.
  */
  labelWidthDidChange: function() {
    var childViews = this.get('childViews'), i, len = childViews.length,
    shouldMeasure = SC.none(this.get('labelWidth'));
    
    for(i = 0; i < len; i++) {
      childViews[i].set('shouldMeasureLabel', shouldMeasure);
    }
    
    this.recalculateLabelWidth();
  }.observes('labelWidth'),
  
  /**
    Propagates the label width to the child rows, finding the measured size if necessary.
  */
  recalculateLabelWidth: function() {
    if (!this._hasCreatedRows) {
      return;
    }
    
    var ret = this.get("labelWidth"), children = this.get("childViews"), idx, len = children.length, child;
    
    // calculate by looping through child views and getting size (if possible and if
    // no label width is explicitly set)
    if (ret === null) {
      ret = 0;
      for (idx = 0; idx < len; idx++) {
        child = children[idx];
      
        // if it has a measurable row label
        if (child.get("rowLabelMeasuredSize")) {
          ret = Math.max(child.get("rowLabelMeasuredSize"), ret);
        }
      }
    }
    
    // now set for all children
    if (this._rowLabelSize !== ret) {
      this._rowLabelSize = ret;
      
      // set by looping throuhg child views
      for (idx = 0; idx < len; idx++) {
        child = children[idx];

        // if it has a measurable row label
        if (child.get("hasRowLabel")) {
          child.set("rowLabelSize", ret);
        }
      }
      
    }
  },
  
  /**
    Rows call this when their label width changes.
  */
  rowLabelMeasuredSizeDidChange: function(row, labelSize) {
    this.invokeOnce("recalculateLabelWidth");
  }


});

SC.mixin(SC.FormView, {
  /**
  Creates a form row.

  Can be called in two ways: `row(optionalClass, properties)`, which creates
  a field with the properties, and puts it in a new row;
  and `row(properties)`, which creates a new row—and it is up to you to add
  any fields you want in the row.
  
  You can also supply some properties to extend the row itself with.
  */
  row: function(optionalClass, properties, rowExt)
  {
    return SC.FormRowView.row(optionalClass, properties, rowExt);
  }
});
