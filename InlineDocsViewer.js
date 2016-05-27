/*
 * Copyright (c) 2013 Adobe Systems Incorporated. All rights reserved.
 *  
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"), 
 * to deal in the Software without restriction, including without limitation 
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, 
 * and/or sell copies of the Software, and to permit persons to whom the 
 * Software is furnished to do so, subject to the following conditions:
 *  
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *  
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING 
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER 
 * DEALINGS IN THE SOFTWARE.
 * 
 */


/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global define, brackets, $, window, Mustache */

/**
 * Inline widget to display WebPlatformDocs JSON data nicely formatted
 */
define(function (require, exports, module) {
  
    var aa = /asdasd/
    'use strict';
    
    // Load Brackets modules
    var ExtensionUtils      = brackets.getModule("utils/ExtensionUtils"),
        InlineWidget        = brackets.getModule("editor/InlineWidget").InlineWidget,
        KeyEvent            = brackets.getModule("utils/KeyEvent"),
        NativeApp           = brackets.getModule("utils/NativeApp"),
        Strings             = brackets.getModule("strings");
    
    // Load template
    var inlineEditorTemplate = require("text!InlineDocsViewer.html");
    
    // Lines height for scrolling
    var SCROLL_LINE_HEIGHT = 40;
    
    // Load CSS
    ExtensionUtils.loadStyleSheet(module, "WebPlatformDocs.less");
    
    /**
     * @param {!string} regexPropName
     * @param {!{SUMMARY:string},{CHEAT_normal},{CHEAT_flags}} regexPropDetails
     */
    function InlineDocsViewer(regexPropName, regexPropDetails, cb, editor) {
        InlineWidget.call(this);
        
      	// valueInfo.t = text (.m = meaning)
        this.regexPropName = regexPropName;
        this.regexPropDetails = regexPropDetails;
        this.regenerateFunction = cb;
        this.editor = editor;
        this.lineNumber = editor.getCursorPos().line;
    };
  
    InlineDocsViewer.prototype = Object.create(InlineWidget.prototype);
    InlineDocsViewer.prototype.constructor = InlineDocsViewer;
    InlineDocsViewer.prototype.parentClass = InlineWidget.prototype;
    
    InlineDocsViewer.prototype.$wrapperDiv = null;
    InlineDocsViewer.prototype.$scroller = null;
    
  
    InlineDocsViewer.prototype.createProperties = function(){
        this.propCheat_normal = this.regexPropDetails.CHEAT_NORMAL.map(function (valueInfo) {
            return { text: valueInfo.t, meaning: valueInfo.m };
        });
		
		// valueInfo.t = text (.type = type (lazy or greedy), .min: minimum, .max = maximum)
        this.propCheat_flags = this.regexPropDetails.CHEAT_FLAGS.map(function (valueInfo) {
			var time = valueInfo.max == 'one' ? 'time' : 'times' ; 
            return { text: valueInfo.t, type: valueInfo.type, min: valueInfo.min, max: valueInfo.max, time: time};
        });
    };
  
    InlineDocsViewer.prototype.getTemplateVars = function(){
        this.templateVars = {
            propName    : this.regexPropName,
            summary     : this.regexPropDetails.SUMMARY,
			cheatsheet_normal	: this.propCheat_normal,
			cheatsheet_flags	: this.propCheat_flags,
            originalRegExMod    : this.originalRegExMod
        };
    };
  
    InlineDocsViewer.prototype.renderTemplate = function(){
        this.createProperties();
        this.getTemplateVars();
      
        var html = Mustache.render(inlineEditorTemplate, this.templateVars);
        this.$wrapperDiv = $(html);
        this.$htmlContent.append(this.$wrapperDiv);
        
        this._sizeEditorToContent   = this._sizeEditorToContent.bind(this);
        this._handleWheelScroll     = this._handleWheelScroll.bind(this);

        this.$scroller = this.$wrapperDiv.find(".scroller");
        this.$scroller.on("mousewheel", this._handleWheelScroll);
        this._onKeydown = this._onKeydown.bind(this);
    };
    /**
     * Handle scrolling.
     *
     * @param {Event} event Keyboard event or mouse scrollwheel event
     * @param {boolean} scrollingUp Is event to scroll up?
     * @param {DOMElement} scroller Element to scroll
     * @return {boolean} indication whether key was handled
     */
    InlineDocsViewer.prototype._handleScrolling = function (event, scrollingUp, scroller) {
        // We need to block the event from both the host CodeMirror code (by stopping bubbling) and the
        // browser's native behavior (by preventing default). We preventDefault() *only* when the docs
        // scroller is at its limit (when an ancestor would get scrolled instead); otherwise we'd block
        // normal scrolling of the docs themselves.
        event.stopPropagation();
        if (scrollingUp && scroller.scrollTop === 0) {
            event.preventDefault();
            return true;
        } else if (!scrollingUp && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight) {
            event.preventDefault();
            return true;
        }
        
        return false;
    };
    
    /** Don't allow scrollwheel/trackpad to bubble up to host editor - makes scrolling docs painful */
    InlineDocsViewer.prototype._handleWheelScroll = function (event) {
        var scrollingUp = (event.originalEvent.wheelDeltaY > 0),
            scroller = event.currentTarget;
        
        // If content has no scrollbar, let host editor scroll normally
        if (scroller.clientHeight >= scroller.scrollHeight) {
            return;
        }
        
        this._handleScrolling(event, scrollingUp, scroller);
    };
    
    
    /**
     * Convert keydown events into navigation actions.
     *
     * @param {KeyboardEvent} event
     * @return {boolean} indication whether key was handled
     */
    InlineDocsViewer.prototype._onKeydown = function (event) {
        var keyCode  = event.keyCode,
            scroller = this.$scroller[0],
            scrollPos;

        // Ignore key events with modifier keys
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
            return false;
        }

        // Handle keys that we're interested in
        scrollPos = scroller.scrollTop;

        switch (keyCode) {
        case KeyEvent.DOM_VK_UP:
            scrollPos = Math.max(0, scrollPos - SCROLL_LINE_HEIGHT);
            break;
        case KeyEvent.DOM_VK_PAGE_UP:
            scrollPos = Math.max(0, scrollPos - scroller.clientHeight);
            break;
        case KeyEvent.DOM_VK_DOWN:
            scrollPos = Math.min(scroller.scrollHeight - scroller.clientHeight,
                                 scrollPos + SCROLL_LINE_HEIGHT);
            break;
        case KeyEvent.DOM_VK_PAGE_DOWN:
            scrollPos = Math.min(scroller.scrollHeight - scroller.clientHeight,
                                 scrollPos + scroller.clientHeight);
            break;
        default:
            // Ignore other keys
            return false;
        }

        scroller.scrollTop = scrollPos;

        // Disallow further processing
        event.stopPropagation();
        event.preventDefault();
        return true;
    };
    
    InlineDocsViewer.prototype.onAdded = function () {
        InlineDocsViewer.prototype.parentClass.onAdded.apply(this, arguments);
        
        // Set height initially, and again whenever width might have changed (word wrap)
        this._sizeEditorToContent();
        $(window).on("resize", this._sizeEditorToContent);

        // Set focus
        this.$scroller[0].focus();
        this.$wrapperDiv[0].addEventListener("keydown", this._onKeydown, true);
    };
    
    InlineDocsViewer.prototype.onClosed = function () {
        InlineDocsViewer.prototype.parentClass.onClosed.apply(this, arguments);
        
        $(window).off("resize", this._sizeEditorToContent);
        this.$wrapperDiv[0].removeEventListener("keydown", this._onKeydown, true);
    };
    
    InlineDocsViewer.prototype._sizeEditorToContent = function () {
        this.hostEditor.setInlineWidgetHeight(this, this.$wrapperDiv.height() + 20, true);
    };
  
    InlineDocsViewer.prototype.setEditInput = function(){
        var h1 = this.getEditInputContainer().find('h1');
        this.getEditInput().attr( 'placeholder', h1.html() );
        this.getEditInputContainer().find('.icon.pencil.edit').click(this.displayEditInput.bind(this));  this.getEditInputContainer().find('.icon.cross.edit').click(this.resetEditInputStatus.bind(this));
        this.getEditInputContainer().find('.icon.checkmark.edit').click(this.getNewResult.bind(this));
        this.getApplyButton().click(this.updateOriginalSelection.bind(this));
    };
  
    InlineDocsViewer.prototype.displayEditInput = function(){
        this.hideApplyButton();
        this.getEditInputContainer().find('.input-container').removeClass( 'hidden' );
        this.$wrapperDiv.find('h1').addClass( 'hidden' );
        this.getEditInputContainer().find('.pencil.edit').addClass( 'hidden' );
    };
  
    InlineDocsViewer.prototype.resetEditInputStatus = function(){
        this.getEditInputContainer().find('.input-container').addClass('hidden');
        this.getEditInput().val('');
        this.$wrapperDiv.find('h1').removeClass('hidden');
        this.getEditInputContainer().find('.pencil.edit').removeClass('hidden');
    };
  
    InlineDocsViewer.prototype.updateOriginalSelection = function(){
        var index = this.originalRegEx.exec( this.line ).index;
        var startPos = {
            line: this.lineNumber,
            ch: index
        };
        var endPos = {
            line: this.lineNumber,
            ch: this.line.length
        };
        this.editor.document.replaceRange( this.newValue, startPos, endPos );
        this.close();
    };
  
    InlineDocsViewer.prototype.getEditInputContainer = function(){
        return this.editInputContainer || (this.editInputContainer = this.$wrapperDiv.find('.new-regex-selector'));
    };
  
    InlineDocsViewer.prototype.getEditInput = function(){
        return this.editInput || (this.editInput = this.getEditInputContainer().find('.input-container input'));
    };
  
    InlineDocsViewer.prototype.cleanHtml = function(){
        this.editInputContainer = null;
        this.editInput = null;
        this.applyButton = null;
        this.$wrapperDiv.remove();
    };
  
    InlineDocsViewer.prototype.getApplyButton = function(){
        return this.applyButton || (this.applyButton = this.getEditInputContainer().find('.apply-regex'));
    };
  
    InlineDocsViewer.prototype.displayApplyButton = function(){
        this.getApplyButton().removeClass('hidden');
    };
  
    InlineDocsViewer.prototype.hideApplyButton = function(){
        this.getApplyButton().addClass('hidden');
    };
  
    InlineDocsViewer.prototype.getNewResult = function(){
        var newRegEx = this.getEditInput().val();
        var newPos = {
          ch: (newRegEx.length+2)/2
        }
        this.newValue = '/' + newRegEx + '/' + this.originalRegExMod;
        var regExInfo = this.regenerateFunction(this.newValue, newPos);
        if( regExInfo ){
            this.regexPropName = regExInfo.REGEX;
            this.regexPropDetails = regExInfo;
            this.cleanHtml();
            this.renderTemplate();
            this.load(this.editor);
            this.setEditInput();
            this.displayApplyButton();
        }
    };
  
    InlineDocsViewer.prototype.setCurrentLine = function( currentLine ){
        this.line = currentLine;
        this.createRegEx();
    };
  
    InlineDocsViewer.prototype.createRegEx = function(){
        this.originalRegEx = new RegExp('[=\s\(:]{0,1}\/' + this.regexPropName + '\/[gim\s\r\;\)]{0,}');
        var match = this.line.match( this.originalRegEx )[0];
        var mod = match.match( /\/[gmi]{1,}$/ ) || [] ;
        this.originalRegExMod = mod[0] ? mod[0].substr( 1, mod[0].length ) : '';
    };
  
    InlineDocsViewer.prototype.display = function(){
        this.renderTemplate();
        this.setEditInput();
    };
    
    module.exports = InlineDocsViewer;
});