var language = brackets.getLocale().substr(0,2);

define(function(require, exports, module) {
     "use strict";
 
    var KeyBindingManager = brackets.getModule("command/KeyBindingManager"),
    EditorManager = brackets.getModule("editor/EditorManager"),
    DocumentManager = brackets.getModule("document/DocumentManager"),
    ExtensionUtils = brackets.getModule("utils/ExtensionUtils");

    var ExtPath = ExtensionUtils.getModulePath(module);
    
    // Extension modules
    var InlineDocsViewer = require("InlineDocsViewer");

    function getRegexInfo( hostEditor ){
          var langId = hostEditor.getLanguageForSelection().getId();
          return function(line, pos){
              var regex = get_regex(line, pos, langId);
              // if the cursor is inside a regular expression
              if (regex) {
                  var summary = regex2summary(regex);

                  if (summary) {
                      var cheatsheet = get_cheatsheet();
                      return {
                        REGEX: regex.ex,
                        SUMMARY:summary,
                        CHEAT_NORMAL:cheatsheet.normal,
                        CHEAT_FLAGS:cheatsheet.flags
                      }			
                  }
              }
            return null;
          }

      };
    
    function inlineProvider(hostEditor, pos) {
        // get programming language
        var langId = hostEditor.getLanguageForSelection().getId();
        
        // Only provide docs when cursor is in php ("clike") content
        if (langId !== "php" && langId !== "clike" && langId !== "javascript") {
            return null;
        }
        
        // no multiline selection
        var sel = hostEditor.getSelection();
        if (sel.start.line !== sel.end.line) {
            return null;
        }
		// get editor content
        var line = hostEditor.document.getLine(sel.start.line);
       
		// if the cursor is inside a regular expression
        var regexInfoFunction = getRegexInfo( hostEditor );
		var regexInfo = regexInfoFunction( line, pos );
        if(regexInfo){
          var result = new $.Deferred();
          var inlineWidget = new InlineDocsViewer( regexInfo.REGEX, regexInfo, regexInfoFunction, hostEditor );
          inlineWidget.setCurrentLine( line );
          inlineWidget.display();
          inlineWidget.load(hostEditor);
          result.resolve(inlineWidget);
          return result.promise();
        }
    }
    
	/**
		Convert RegEx to summary
		@param regex {obeject} (.ex,.flags,.lang) regular expression incl. flags and programming lanugage
		@return summary {string} complete summary for regex
	*/
	function regex2summary(regex) {
		var parts = get_parts(regex.ex);
		// example (regex = 'abc(?:def)?')
		/* parts:
			abc (nogroup)
			?:def (group)
			? (nogroup)
		*/

		// next part is to add the '?' as an outside flag and '?:' as an inside flag
		var groups = add_flags(parts);
		groups = add_sq_brackets(groups);
		if (groups) {
			// groups,group_counter,padding,global flags (i.e gmi), programming language,
			return get_summary(groups,1,0,regex.flags,regex.lang);
		} else {
			return null;
		}
	}
	
    /**
     * Gets the regex part
     * @param   {String} line   current line
     * @param   {Object} pos    cursor position (pos.ch and pos.line)
     * @param   {string} langId programming lang
     * @returns {object} regular expression as an object (.ex,.flag,.lang) null otherwise
     */
    function get_regex(line,pos,langId) {
        // get string after current position
        var line_after = line.substr(pos.ch);
        // get string before current position
        var line_begin = line.substr(0,pos.ch);
        // reverse the string before current position
        var line_begin_rev = reverse_str(line_begin);
    	
		
		var start_slash = line_begin_rev.indexOf('/');
		var nostart = true;
		// if there is a start slash else return null
		if (start_slash === -1) {
			return null;	
		}
		// while no start position found
		while (nostart && start_slash !== -1) {
			var i = 1;
			// if there is a \ before the / count the \'s 
			while (line_begin_rev.substr(start_slash+i,1) === '\\') {
				i++;
			}
			// if there are 1,3,5,... \'s find a new start slash
			if (i % 2 === 0) {
				start_slash = line_begin_rev.indexOf('/',start_slash+1);	
			} else {
				// current slash is the start slash 
				nostart = false;	
			}
		}
		// line after is the string after the start slash
		line_after = reverse_str(line_begin_rev.substr(0,start_slash)) + line_after;
		
		var end_slash = line_after.indexOf('/');
		var noend = true;
		// if there is a end slash else return null
		if (end_slash === -1) {
			return null;	
		}
		
		// while no end slash found
		while (noend && end_slash !== -1) {
			var i = 1;
			while (line_after.substr(end_slash-i,1) === '\\') {
				i++;
			}
			// if there are 1,3,5,... \'s find a new start slash
			if (i % 2 === 0) {
				end_slash = line_after.indexOf('/',end_slash+1);	
			} else {
				// current slash is the end slash 
				noend = false;	
			}
		}
		var ex = line_after.substr(0,end_slash);
		var flags = get_regex_flags(line_after.substr(end_slash+1));
		
		var regex = {ex:ex,flags:flags,lang:langId};
		return regex;
	}
	
	/**
		get regex flags like g,m,i as a string (gmi) no commas
		@param string {string} string after end_slash until end of line
		@return flags {string}		
	*/
	function get_regex_flags(string) {
		// flags are before the first ['.,;$] $ => end of line	
		return string.substring(0,string.search(/(,|\.|;|'|$)/));
	}
	
	
	/**
		Get groups and the parts between
		@param regex {string} regular expression
		@return groups	
	*/
	function get_parts(regex) {
		var groups = get_next_part(new Array(),regex);
	
		return groups;
	}
	
	
	/**
	 * get next part
	 * @param   {array}        groups groups that already parsed
	 * @param   {string}       regex  part or whole regex
	 * @returns {array|object} groups
	 */
	function get_next_part(groups,regex) {
		// get first char
		var last_char = regex.substr(0,1);
		// if the regex part is starting with a group
		if (last_char === '(') {
			var start_group = 0;	
		} else {
			var sq_bracket = get_square_bracket(0,last_char,regex);
			// find first not escaped '(' which isn't inside a [..] group
			var escaped = false;
			var i = 0;
			while ((regex.substr(i,1) !== '(' || escaped || (i > sq_bracket.start_pos && i < sq_bracket.end_pos)) && i < regex.length ) {
				if (i > sq_bracket.start_pos && i < sq_bracket.end_pos) {
					i = sq_bracket.end_pos;	
					sq_bracket = get_square_bracket(i,']',regex);
				} else {
					if (!escaped && regex.substr(i,1) == '\\') {
						escaped = true;
					} else {
						escaped = false;	
					}
					i++;
				}
			}
			
			var start_group = i;
		}
		// isn't starting with a group
		if (start_group !== 0) {
			groups.push({group:false,text:regex.substring(0,start_group)});
			if (start_group >= regex.length) {
				return groups;	
			} else {
				return get_next_part(groups,regex.substr(start_group));
			}
		} else { // is starting with a group
			var i = 1;
			var another_group = 0; 
			// is true if there is a group inside this group
			var group_inside = false;
			// save the position of the first inline group
			var first_inline = {start: 0, end: 0};
			while ((regex.charAt(i) !== ')' || last_char == '\\' || another_group != 0) && i < regex.length) {
				if (regex.charAt(i) === '(' && last_char != '\\') {
					// if it's the first inline group
					if (another_group === 0) {
						first_inline.start = i;
					}
					another_group++; // group in current group
					group_inside = true;
				}
				if (regex.charAt(i) === ')' && last_char != '\\') {
					another_group--; // last inside group closed
					if (another_group === 0) { // first inline group
						first_inline.end = i;
					}
				}
				if (last_char == '\\' && regex.substr(i,1) == '\\') {
					i++;
				}
				last_char = regex.substr(i,1);
				i++;
			}
			var end_group = i;
			// or delimiter without () and outside flags
			var or_groups = add_or_delimiter(regex.substring(1,end_group),first_inline);
			
			if (or_groups) { // if this group contains alternatives (ors)
				groups.push({group:true,text:regex.substring(1,end_group),or:or_groups});
			} else {
				if (!group_inside) { // normal
					groups.push({group:true,text:regex.substring(1,end_group)});
				} else { // group inside this group
					groups.push({group:true,text:regex.substring(1,end_group),n_b:get_next_part(new Array(),regex.substring(1,end_group))});
				}
				
			}
		
			if (end_group+1 >= regex.length) {
				return groups;	
			} else {
				return get_next_part(groups,regex.substr(end_group+1));
			}
		 }
	}
	
	/**
		get next square bracket start and end position
		@param start_pos {integer} look behind this position
		@param last_char {char} char directly before start_pos
		@param regex {string} regular expression or a part
		@return object (.start,.end) position
	*/
	function get_square_bracket(j,last_char,regex) {
		var square_bracket = {};
		// find first not escaped [
		while ((regex.substr(j,1) !== '[' || last_char == '\\') && j < regex.length) {
			if (last_char == '\\' && regex.substr(j,1) == '\\') {
				last_char = '';
			} else { 
				last_char = regex.substr(j,1);
			}
			j++;
		}
		square_bracket.start_pos = j;
		// find first not escaped ]
		while ((regex.substr(j,1) !== ']' || last_char == '\\') && j < regex.length) {
			if (last_char == '\\' && regex.substr(j,1) == '\\') {
				last_char = '';
			} else { 
				last_char = regex.substr(j,1);
			}
			j++;
		}
		square_bracket.end_pos = j;	
		
		return square_bracket;
	}
	
	/**
		add flags to groups
		@param parts {array/object}
		@return groups, array/object with inside flags and outside flags
	*/
	function add_flags(parts) {
		// true if last part was a group (important for flags)
		var last_group = false;
		for(var i = 0; i < parts.length; i++) {
			// last one is a group current not
			if (!parts[i].group && last_group) {
				// check for outside flags
				var match = /^(\*\?|\*|\+\?|\+|\?\?|\?|{\d+,?\d*})/.exec(parts[i].text);
				if (match) {
					// set flag
					parts[i-1].o_flag = match[1];
					// delete flag from text_part
					parts[i].text = parts[i].text.substr(match[1].length);
				}
			}
			// is a group
			if (parts[i].group) {
				// check for inside flags
				var match = /^(\?:|\?!|\?=)/.exec(parts[i].text);
				if (match) {
					// set flag
					parts[i].i_flag = match[1];
					// delete flag from text_part
					parts[i].text = parts[i].text.substr(match[1].length);
				}
				if (parts[i].or) {
					parts[i].or = add_flags(parts[i].or);
				}
				
				
			}
			if (parts[i].n_b) {
				parts[i].n_b = add_flags(parts[i].n_b);
			}
			
			last_group = parts[i].group;
		}
		
		// delete empty parts (if a part was a flag)
		var groups = [];
		for(var i = 0; i < parts.length; i++) {
			if (parts[i].text !== '') {
				groups.push(parts[i]);
			}
		}
		
		return groups;
	}
	
	/**
		create an array for all alternative parts inside an regex
		@param regex {string} 
		@param inline_group {object} .start,.end, 0 for no inline group
		@return or_groups {object/array}
	*/
	function add_or_delimiter(regex,inline_group) {
		var or_parts = regex.split('|');
		// if first part is inside an inline group will be parsed afterwards for this inline group
		if (or_parts[0].length > inline_group.start && or_parts[0].length < inline_group.end) { 
			return null;
		}
		
		// there are ors inside (|) (can be (\|) !!!) 
		if (or_parts.length > 1) {
			// the last part (length-1) must be a own or part
			for (var j = 0; j < or_parts.length-1; j++) {
				// the | can be inside an group ()
				var groupOpen = 0;
				var sqOpen = 0;
				for (var c = 0; c < or_parts[j].length; c++) {
					switch (or_parts[j].charAt(c)) {
						case '\\':
							c++;
							break;
						case '[':
							sqOpen++;
							break;
						case ']':
							sqOpen--;
							break;
						case '(':
							groupOpen++;
							break;
						case ')':
							groupOpen--;
							break;
					}
					if (groupOpen != 0 || sqOpen != 0) {
						or_parts[j+1] = or_parts[j] + '|' + or_parts[j+1]; // will be scanned again
						or_parts[j] = '';
					}
				}
				if (or_parts[j] != '') {
					// there is an odd number of backslashes at the end
					if (or_parts[j].match(/(^|[^\\])([\\]([\\]{2})*?)$/)) {
						// this match belongs to the next or group
						or_parts[j+1] = or_parts[j] + '|' + or_parts[j+1];
						or_parts[j] = '';
					}
				}
			}
			// delete empty parts
			var temp = [];
			for (var j = 0; j < or_parts.length; j++) {
				if (or_parts[j] !== '') {
					var next_part = get_next_part(new Array(),or_parts[j]);
					// only one element => no n_b part
					if (next_part.length === 1) {
						temp.push(next_part[0]);
					} else {
						// n_b parts inside
						temp.push({n_b:next_part,text:or_parts[j]});
					}
					//temp.push(get_next_part(new Array(),or_parts[j]));
				}						
			}

			// there are ors inside (|)
			if (temp.length > 1) {
				var or_groups = {};
				or_groups = temp;
				or_groups.text = regex;
				
			} else {
				return null;	
			}
		}
		return or_groups;	
	}
	
	/**
		add square bracket parts to groups
		@param groups {array/object}
		@return groups, array/object with bracket parts
	*/
	function add_sq_brackets(groups) {
		for(var i = 0; i < groups.length; i++) {
			// if group inside the current group exists
			if (groups[i].n_b) {
				groups[i].n_b = add_sq_brackets(groups[i].n_b);				
			} else if (groups[i].or) {
				groups[i].o = add_sq_brackets(groups[i].or);	
			} else if (!groups[i].or) { 
				/* if group has no inside group there can be a [] group inside
				 if current group contains another normal group, a [] group will a part
				 of one group inside
				*/
				
				// get square bracket start and end position
				var square_bracket = get_square_bracket(0,'',groups[i].text);

				var j = 0;
				groups[i].sq_b = [];
				while (square_bracket.end_pos < groups[i].text.length) {
					// get inside and outside flags of current square bracket group  
					var sq_flags = get_sq_flags(groups[i].text.substr(square_bracket.start_pos+1,1),groups[i].text.substr(square_bracket.end_pos+1));

					// text inside the square brackets incl. [ and ]
					var text = groups[i].text.substring(square_bracket.start_pos,square_bracket.end_pos+1);

					// add square bracket information into the group array
					groups[i].sq_b[j] = {start_pos: square_bracket.start_pos,end_pos: square_bracket.end_pos};
					

					// add inside and outside flags if they exist
					if (sq_flags.in) {
						groups[i].sq_b[j].i_flag = sq_flags.in;
					}
					if (sq_flags.out) {
						groups[i].sq_b[j].o_flag = sq_flags.out;
						// add flag to text 
						text += sq_flags.out;	
					}
					
					groups[i].sq_b[j].text = text;

					// get the next square bracket start and end position
					square_bracket = get_square_bracket(square_bracket.end_pos,'',groups[i].text);

					j++;
				}
			}
		}	
		
		return groups;
	}

	
	/**
		get square group flags
		@param first_char {char} first char inside the square group
		@param last_chars {string} chars after the square group
		@return flags {object}, flags.in,flags.out
	*/
	function get_sq_flags(first_char,last_chars) {
		
		var flags = {};
		// check for inside flag (can be only a ^)
		if (first_char == '^') {
			flags.in = '^';
		}
		// check for outside flags
		var match = /^(\*\?|\*|\+\?|\+|\?\?|\?|{\d+,?\d*})/.exec(last_chars);
		if (match) {
			flags.out = match[1];	
		}
		return flags;
	}
	
	/**
		create the inline documentation summary
		@param groups {array/object}
		@param group_counter {integer} group_counter starting with 1 (+1 after a ()) 
		@param padding {integer} normal 0, if it's a group inside another 1,...
		@param flags {string} flags for the whole regex only for padding = 0
		@param lang {string} javascript,php or clike (important for flags)
		@return summary {string} stasjnladsnld
	*/
	function get_summary(groups,group_counter,padding,flags,lang) {
				
		// padding or groups inside groups
		var padding_left = padding*10;
		var summary = '<dl style="padding-left:' + padding_left + 'px">';
			
		
		// global regex flags (modifier)
		if (flags && padding === 0) {
			summary += '<dl>';
			switch (lang) {
				case "javascript":
					if (flags.indexOf('g') !== -1) {
						summary += '<dd><span class="modifier">g modifier</span> <b>g</b>lobal: Returns all matches.</dd>';
					}
					if (flags.indexOf('m') !== -1) {
						summary += '<dd><span class="modifier">m modifier</span> <b>m</b>ulti-line: ';
						summary += 'Causes <span class="text">^</span> and <span class="text">$</span> the begin/end of each line.</dd>';
					}
					if (flags.indexOf('i') !== -1) {
						summary += '<dd><span class="modifier">i modifier</span> <b>i</b>nsensitive: Ignores cases of literally matches</dd>';
					}
					break;
				case "php":
				case "clike":
					if (flags.indexOf('g') !== -1) {
						summary += '<dd><span class="modifier">g modifier</span> <b>g</b>lobal: Returns all matches.</dd>';
					}
					if (flags.indexOf('m') !== -1) {
						summary += '<dd><span class="modifier">m modifier</span> <b>m</b>ulti-line: ';
						summary += 'Causes <span class="text">^</span> and <span class="text">$</span> the begin/end of each line.</dd>';
					}
					if (flags.indexOf('i') !== -1) {
						summary += '<dd><span class="modifier">i modifier</span> <b>i</b>nsensitive: Ignores cases of literally matches</dd>';
					}
					// FUTURE: more flags like xXsuUA
				break;
			}
					
			summary += '</dl>';		
		}
		
		for (var i = 0; i < groups.length; i++) {
			// special colors (class) if it is a () group
			if (groups[i].group) {	
				summary += '<dl><dt>';
				// add group counter if it's a capturing group (no inline flag)
				if (!groups[i].i_flag) {
					summary += '<span class="group_counter">[' + group_counter + ']</span> ';
					group_counter++;
				} 				
				if (!groups[i].i_flag && !groups[i].o_flag) {
					summary += '<span class="regex_group">(' + encodeHTML(groups[i].text) + ')</span></dt>';
				} else if (!groups[i].i_flag) {
					summary += '<span class="regex_group">(' + encodeHTML(groups[i].text) + ')' + groups[i].o_flag + '</span></dt>';
				} else if (!groups[i].o_flag){
					summary += '<span class="regex_group">(' + groups[i].i_flag + encodeHTML(groups[i].text) + ')</span></dt>';
				} else {
					summary += '<span class="regex_group">(' + groups[i].i_flag + encodeHTML(groups[i].text) + ')' + groups[i].o_flag + '</span></dt>';
				}
				 
			} else { // no group
				summary += '<dl><dt><span class="regex_nogroup">' + encodeHTML(groups[i].text) + '</span></dt>';
			} 
			
			// add inside and outside flags
			if (groups[i].i_flag) {
				var flg = get_iflag_values(groups[i].i_flag);
				summary += '<dd><span class="flag">' + groups[i].i_flag+ '</span> ' + flg.type + '</dd>';	
			} 
			if (groups[i].o_flag) 
			{
				var flg = get_oflag_values(groups[i].o_flag);
				summary += '<dd><span class="flag">' + groups[i].o_flag + '</span> matches the group ';
				summary += add_meanings([{type:"flag",min:flg.min,max:flg.max,quant_type:flg.type}]); // there is a </dd>
			}
			
			// [] group 
			if (groups[i].sq_b) {
				var current_pos = 0;
				var j = 0;
				while (groups[i].sq_b[j]) {
					// check if current position is the start for a [] group
					if (groups[i].sq_b[j].start_pos === current_pos) {
						summary += '<dd>';
						summary += '<dl><dt><span class="regex_square">'
										+ groups[i].sq_b[j].text +
									'</span> matches a single character present in the list below</dt>';
						
						var in_sq_text = groups[i].sq_b[j].text;
						if (groups[i].sq_b[j].i_flag) {
							var flg = get_iflag_values(groups[i].sq_b[j].i_flag);
							summary += '<dd><span class="flag">' + groups[i].sq_b[j].i_flag+ '</span> ' + flg.type + '</dd>';
							in_sq_text = in_sq_text.substr(1+groups[i].sq_b[j].i_flag.length); // delete [ and inline flag
						} else {
							in_sq_text = in_sq_text.substr(1); // delete [ 
						}	
						
						if (groups[i].sq_b[j].o_flag) 
						{
							var flg = get_oflag_values(groups[i].sq_b[j].o_flag);
							summary += '<dd><span class="flag">' + groups[i].sq_b[j].o_flag + '</span> matches the group ';
							summary += add_meanings([{type:"flag",min:flg.min,max:flg.max,quant_type:flg.type}]); // there is a </dd> 
						}
						
						in_sq_text = in_sq_text.substring(0,in_sq_text.indexOf(']')); // delete ]
						
						var meanings = get_meaning(in_sq_text,true);
						summary += add_meanings(meanings,true);
						
						summary += '</dl></dd>';
						current_pos = groups[i].sq_b[j].end_pos+1;
						if (groups[i].sq_b[j].o_flag) {
							current_pos += groups[i].sq_b[j].o_flag.length;	
						}
						j++;
					} else { // if the current char isn't inside a [] group
						var current_part = groups[i].text.substring(current_pos,groups[i].sq_b[j].start_pos);
						var meanings = get_meaning(current_part,false);
						summary += add_meanings(meanings);
						current_pos = groups[i].sq_b[j].start_pos;
					}
					
					
				}
				// string after the last [] group if it exists
				if (current_pos != groups[i].text.length) {
					var current_part = groups[i].text.substring(current_pos);
					var meanings = get_meaning(current_part,false);
					summary += add_meanings(meanings);
				}
				
			} else { // if this group doesn't contain a sqaure bracket group
				// if this group contains a normal group
				if (groups[i].n_b) {
					summary += get_summary(groups[i].n_b,group_counter,padding+1);	
				} else if (groups[i].or) { // or group
					summary += '<dt>(Or alternatives) Matches one of the following parts:</dt>'; 
					summary += get_summary(groups[i].or,group_counter,padding+1);
				} else {
					var meanings = get_meaning(groups[i].text,false);
					summary += add_meanings(meanings);
				}
			}
				
			summary += '</dl>'; // regex group/nogroup end
		}
		summary += '</dl>'; // global summary end
		return summary;
	}
	
	/**
	 * Encode an html string
	 * @param {string} str html string
	 * @returns encoded string
	 */
	function encodeHTML(str){
	 var aStr = str.split(''),
		 i = aStr.length,
		 aRet = [];

	   while (--i >= 0) {
		var iC = aStr[i].charCodeAt();
		if (iC < 65 || iC > 127 || (iC>90 && iC<97)) {
		  aRet.push('&#'+iC+';');
		} else {
		  aRet.push(aStr[i]);
		}
	  }
	 return aRet.reverse().join('');
	}

	/**
	 * get the meaning of a regex part inside a group or a [] group or...
	 * @param   {string}       part            a regex part without groups in it.
	 * @param   {boolean}      square_brackets the chars inside a [] have a different meaning
	 * @returns {array/object} meaning
	 */
	function get_meaning(part,square_brackets) {
		var meanings = [];
		if (square_brackets) {
			var i = 0;
			var last = 0; // Attention! part is without [
			while( i < part.length) {
				// if current char is \
				if (part.charAt(i) === '\\') {
					// if last match was not directly before this match
					// substring => char nr. i isn't part of text
					if (last < i) { meanings.push({text:part.substring(last,i),meaning:part.substring(last,i),type:'literally'}); }
					// which char is directly after the \
					meanings.push(get_special_meaning(part.charAt(i+1)));
					last = i+2;
					i++;
				} else if (part.charAt(i) === '-' && i !== part.length-1) { // part.length-2 => last char inside the [] group
					// i-1 because the char before '-' is part of between
					if (last < (i-1)) {
						meanings.push({text:part.substring(last,i-1),meaning:part.substring(last,i-1),type:'literally'}); 
					}
					meanings.push({text:part.substr(i-1,3),a:part.charAt(i-1),b:part.charAt(i+1),type:'between'});
					last = i+2;	
					i++;
				} else if (i === part.length-1) {
					meanings.push({text:part.substring(last,part.length),meaning:part.substring(last,part.length),type:'literally'});		
				}
				i++;
			}	
		} else { // no square brackets
			var regex = /(\^|\$|\.|{(\d+?)(,)?(\d*?)}(\??)|\*\?|\*|\+\?|\+|\?\?|\?|\\s|\\S|\\d|\\D|\\w|\\W|\\b|\\B|\\t|\\r|\\n)/g
			var last = 0;
			var double_match = false;
			var last_matches = null;
			var matches = null;
			var correct_matches = [];
			while (matches = regex.exec(part))
			{
				// there must be an even number of slashes before (or 0) or part starts with a match
				if (matches.index === 0 || part.substring(last,matches.index).match(/[^\\](([\\]{2})*?)$/)) {
					correct_matches.push(matches);
				}
			}	
			
			
			for (var matches; matches = correct_matches.shift(i,1);) {
				if (last < matches.index) {
					// string before current match
					if (matches[1].charAt(0) === '\\') {
						var str_before = part.substring(last,matches.index);
					} else { // the char before a flag like *,+, etc. belongs to the flag
						var str_before = part.substring(last,matches.index-1);
					}
					// normal (literally)
					if (str_before != '') {
						meanings.push({text:str_before,meaning:stripSlashes(str_before),type:'literally'});
					}
				}
				
				// check if there was a match before
				if (last_matches) {
					// if a \d,\s...  was directly before this (like: \d*?)
					if (last_matches.index+2 === matches.index && last_matches[1].charAt(0) === '\\') {
						double_match = true;
					} else {
						double_match = false;	
					}
				}
				
				// FUTURE: Check if there is a \ before
				var cu_char = part.charAt(matches.index-1);

				if (matches[1].charAt(0) === '\\') {
					meanings.push(get_special_meaning(matches[1].charAt(1)));
				} else {
					switch(matches[1]) {
						case ".":
							meanings.push({text:matches[1],meaning:'any single character',type:'special'});
							break;
						case "^":
							meanings.push({text:matches[1],meaning:'assert position at start of the string',type:'assert'});
							break;
						case "$":
							meanings.push({text:matches[1],meaning:'assert position at end of the string',type:'assert'});
							break;
						case "*?":
						case "*":
						case "+?":
						case "+":
						case "??":
						case "?":
						default: 
							var flg = get_oflag_values(matches[1]);
							if (!double_match) {
								meanings.push({text:cu_char,meaning:cu_char,flag:matches[1],type:'flag',min:flg.min,max:flg.max,quant_type:flg.type});
							} else { // if there was sth. like \d directly before
								var bfr = meanings.pop();
								meanings.push({text:bfr.text,meaning:bfr.meaning,flag:matches[1],type:'flag',min:flg.min,max:flg.max,quant_type:flg.type});
							}
							break;
					}
				}

				// last index
				last = matches.index+matches[1].length;
				// last matches
				last_matches = matches;
			}
			if (last < part.length) { 
				// string after last match
				var str_after = part.substring(last);
				// normal (literally)
				meanings.push({text:str_after,meaning:stripSlashes(str_after),type:'literally'});
			}
		}
		return meanings;
	}
	
	/** 
		add meanings to summary
		@param meanings {array/object} includs new Array({type[,text,meaning][,min,max,quant_type]})
		@param sq_brackets {boolean} optional (default: false)
		@return summary_part {string}
	*/
	function add_meanings(meanings,sq_brackets) {
		sq_brackets = (typeof sq_brackets === "undefined") ? false : sq_brackets;
				
		var result = '';
		var i = 0;
		while (meanings[i]) {
			switch (meanings[i].type) {
				case "flag":
					if (meanings[i].text) {
						result += '<dd><span class="text">' + encodeHTML(meanings[i].text) + meanings[i].flag + '</span> matches ';
						result += '<span class="meaning">' + encodeHTML(meanings[i].meaning) + '</span> ';
					}
					if (meanings[i].min === meanings[i].max) { // exactly times (no quant_type)
						result += 'exactly <span class="flag_between">' + meanings[i].min + '</span> times';						
					} else {
						result += 'between <span class="flag_between">' + meanings[i].min + '</span> and ';
						result += '<span class="flag_between">' + meanings[i].max + '</span>';
						if (meanings[i].max !== 'one') {
							result += ' times';
						} else {
							result += ' time';	
						}
						result += ' <span class="quant_type">[' + meanings[i].quant_type + ']</span>'; // lazy || greedy
					}
					result += '</dd>';
					break;
				case "literally":
					if (sq_brackets && meanings[i].meaning.length > 1) {
						result += '<dd><span class="text">' + encodeHTML(meanings[i].text) + '</span> matches a single character in the list ';
						result += '<span class="meaning">' + encodeHTML(meanings[i].meaning) + '</span> literally</dd>';
					} else { // normal or a single char
						result += '<dd><span class="text">' + encodeHTML(meanings[i].text) + '</span> matches ';
						result += '<span class="meaning">' + encodeHTML(meanings[i].meaning) + '</span> literally</dd>';
					}
					break;
				case "between":
					// not possible if sq_brackets isn't true
					if (sq_brackets) {
						result += '<dd><span class="text">' + encodeHTML(meanings[i].text) + '</span> matches a singe character in the range between ';
						result += '<span class="meaning">' + meanings[i].a + '</span> and ';
						result += '<span class="meaning">' + meanings[i].b + '</span></dd>';
					}
					break;
				case "special":
					result  += '<dd><span class="text">' + encodeHTML(meanings[i].text) + '</span> matches ';
					result += '<span class="meaning">' + encodeHTML(meanings[i].meaning) + '</span></dd>';
					break;
				case "assert":
					result  += '<dd><span class="text">' + encodeHTML(meanings[i].text) + '</span> ';
					result += encodeHTML(meanings[i].meaning) + '</dd>';
					break;				
			}
			i++;	
		}
		return result;
	}
	
	/**
		get the meaning of a special type
		\s => special type
		\f (no special type) => f literally
		@param char {char} char after the \
		@return special_object (.text,.meaning,.type='special')
	*/
	function get_special_meaning(char) {
		var special_obj = {};
		switch (char) {
			case "s":
				special_obj = {text:'\\' + char,meaning:'any whitespace character',type:'special'};
				break;
			case "S":
				special_obj = {text:'\\' + char,meaning:'any non-whitespace character',type:'special'};
				break;
			case "d":
				special_obj = {text:'\\' + char,meaning:'any digit',type:'special'};
				break;
			case "D":
				special_obj = {text:'\\' + char,meaning:'any non-digit',type:'special'};
				break;
			case "w":
				special_obj = {text:'\\' + char,meaning:'any word character',type:'special'};
				break;
			case "W":
				special_obj = {text:'\\' + char,meaning:'any non-word character',type:'special'};
				break;
			case "b":
				special_obj = {text:'\\' + char,meaning:'a word boundary',type:'special'};
				break;
			case "B":
				special_obj = {text:'\\' + char,meaning:'a non-word boundary',type:'special'};
				break;
			case "t":
				special_obj = {text:'\\' + char,meaning:'a tab',type:'special'};
				break;
			case "n":
				special_obj = {text:'\\' + char,meaning:'a newline character',type:'special'};
				break;
			case "r":
				special_obj = {text:'\\' + char,meaning:'a carriage return',type:'special'};
				break;
			default:
				special_obj = {text:'\\' + char,meaning:char,type:'literally'};
		}
		return special_obj;
	
	}
	
	/**
		get outside flag values (min,max,type)
		@param flag {string} flag like '*?' or '{3,}'
		@return object (.min,.max,.type)
	*/
	function get_oflag_values(flag) {
		switch (flag) {
			case "*?":
				return {min:'zero',max:'unlimited',type:'lazy'};
			case "*":
				return {min:'zero',max:'unlimited',type:'greedy'};
			case "+?":
				return {min:'one',max:'unlimited',type:'lazy'};
			case "+":
				return {min:'one',max:'unlimited',type:'greedy'};
			case "??":
				return {min:'zero',max:'one',type:'lazy'};
			case "?":
				return {min:'zero',max:'one',type:'greedy'};
			default:	
				// flag like {3} or {3,} or {3,4}
				if (flag.charAt(0) === '{') { 
					// delete the { and the }
					var params = flag.substring(1,flag.indexOf('}')).split(',');
					var quant_type = (flag.indexOf('}') !== flag.length-1) ? 'lazy' : 'greedy';
					var min = params[0];
					var max = params[0];
					// length 2 => comma found
					if (params.length === 2) {
						max = 'unlimited';
						if (params[1] != '') {
							max = params[1];	
						}
					}
					
					return {min:min,max:max,type:quant_type};
				}
				break;		
		}		
	}
	
	/**
		get inline flag type
		@param flag {string} flag like '?:' or '?='
		@param flag {object} (.type)
	*/
	function get_iflag_values(flag) {
		switch(flag) {
			case "?:":
				return {type:'non-capturing group'};
			case "?=":
				return {type:'positive lookahead'};
			case "?!": 
				return {type:'negative lookahead'};
			case '^':
				return {type:'not matching'};		
		}
	}
	
	
	/**
		get cheatsheet (expressions and descriptions)
		@return cheats {array/object} (.t,.d)
	*/
	function get_cheatsheet() {
		var cheats = {};
		var normal = [];
		normal.push({t:'.',m:'Any single character'});
		normal.push({t:'^',m:'Start of string'});
		normal.push({t:'$',m:'End of string'});
		normal.push({t:'[abc]',m:'A single character in the list \'abc\''});
		normal.push({t:'[^abc]',m:'Any single character except a,b or c'});
		normal.push({t:'[a-z]',m:'A single character between a and z'});
		normal.push({t:'\\d',m:'Any digit'});
		normal.push({t:'\\D',m:'Any non-digit'});
		normal.push({t:'\\b',m:'A word boundary'});
		normal.push({t:'\\B',m:'Any non-word boundary'});
		normal.push({t:'\\s',m:'Any whitespace character'});
		normal.push({t:'\\S',m:'Any non-whitespace character'});
		normal.push({t:'\\w',m:'Any word character'});
		normal.push({t:'\\W',m:'Any non-word character'});
		normal.push({t:'(ab)',m:'Matches ab'});
		normal.push({t:'(a|b)',m:'Matches a or b'});
		cheats.normal = normal;
		
		var flags = [];
		flags.push({t:'?',type:'greedy',min:'zero',max:'one'});
		flags.push({t:'??',type:'lazy',min:'zero',max:'one'});
		flags.push({t:'+',type:'greedy',min:'one',max:'unlimited'});
		flags.push({t:'+?',type:'lazy',min:'one',max:'unlimited'});
		flags.push({t:'*',type:'greedy',min:'zero',max:'unlimited'});
		flags.push({t:'*?',type:'lazy',min:'zero',max:'unlimited'});
		cheats.flags = flags;
		
		return cheats;
	}
	
	
	/**
        reverse a string
    */
    function reverse_str(s){
        return s.split("").reverse().join("");
    }
	
	/**
		Strip slashes
		@param string
		@return string "without" slashes 
	*/
	function stripSlashes(str){
		return str.replace(/\\(.)/mg, "$1");
	}
	
    EditorManager.registerInlineDocsProvider(inlineProvider); 
	
	exports._inlineProvider  = inlineProvider;
});
