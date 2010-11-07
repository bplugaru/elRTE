(function($) {
	
	if(!Array.prototype.indexOf) {
		Array.prototype.indexOf = function(searchElement, fromIndex){
			for(var i = fromIndex||0, length = this.length; i<length; i++) {
				if(this[i] === searchElement) { return i; }
			}
			return -1;
		};
	}
		
	
	
	/**
	 * @Class elRTE editor
	 * @todo  add  history methods wrappers to api
	 * 
	 * @param DOMElement  
	 * @param Object  editor options
	 */
	elRTE = function(t, o) {
		
		this.time('load');
		/* version */
		this.version = '1.1 dev';
		/* build date */
		this.build = '20100906';
		/* editor config */
		this.options = $.extend(true, {}, this.options, o);
		/* messages language */
		this.lang = 'en';
		/* messages */
		this.messages = this.i18Messages[this.options.lang]||{};
		/* check is target is node in dom */
		if (t && t.jquery) {
			t = t[0];
		}
		
		if (!t || !t.parentNode) {
			return alert("Unable create elRTE editor!\n Required element does not exists on this page.");
		}
		
		/* editor instance id. viewport id and base part for inner elements ids */
		this.id = 'elrte-'+(t.id||t.name||Math.random().toString().substr(2));
		/* create editor view */
		this.viewport  = $('<div class="elrte '+(this.options.cssClass||'')+'" id="'+this.id+'" />')
			.append((this.tabsbar   = $('<div/>')))
			.append((this.workzone  = $('<div class="elrte-workzone"/>')))
			.append((this.statusbar = $('<div class="elrte-statusbar" />')))
			.insertBefore(t);
		
		/* add target node as document if enabled */
		this.options.loadTarget && this.options.documents.unshift(t);
		/* remove target node */
		$(t).remove();
		/* form */
		this.form = this.viewport.parents('form');
		/* is xhtml doctype used for editable iframe? */
		this.xhtml = /xhtml/i.test(this.options.doctype);
		/* is macosX? */
		this.macos = navigator.userAgent.indexOf('Mac') != -1;
		/* loaded commands */
		this._commands = {};
		/* loaded plugins */
		this._plugins = {};
		/* shortcuts */
		this.shortcuts = {};

		this.KEY_UNKNOWN = 0;
		this.KEY_CHAR    = 1;
		this.KEY_ENTER   = 2;
		this.KEY_DEL     = 3;
		this.KEY_TAB     = 4;
		this.KEY_ARROW   = 5;
		this.KEY_SERVICE = 6;

		this.lastKey = 0;
		this.typing  = false;
		/* cached change on keydown to rise change event after keyup */
		this.change = false;
		/* last opened document number */
		this.ndx = 0;
		/* opened documents */
		this.documents = { };
		/* active(visible) document */
		this.active    = null;
		/* events listeners */
		this.listeners = {
			/* called once after elRTE init and load documents */
			'load'      : [],
			/* called before? editor will be set visible */
			'show'      : [],
			/* called before? editor will be set hidden */
			'hide'      : [],
			/* called after new document added to editor */
			'open'      : [], 
			/* called after document switch to source mode */
			'source'    : [],
			/* called after document switch to wysiwyg mode */
			'wysiwyg'   : [],
			/* called before close document */
			'close'     : [],
			/* called before command will be executed */
			'exec'      : [],
			/* called after some changes was made in document. */
			'change'    : [],
			/* called after change carret position */
			'chagePos'  : [],
			/* called before send form */
			'save'      : [],
			/* called on mousedown on document */
			'mousedown' : [],
			/* called on mouseup on document */
			'mouseup'   : [],
			/* called on keydown on document */
			'keydown'   : [],
			/* called on keyup on document */
			'keyup'     : [],
			/* called on click on document */
			'click'     : [],
			/* called on double click on document */
			'dblclick'  : [],
			/* called before cut from document */
			'cut'       : [],
			/* called before paste in document */
			'paste'     : [],
			'hideUI' : []
			};
		
		/**
		 * Initilize editor
		 *
		 * @return void
		 **/	
		this.init = function() {
			var self = this, 
				o = this.options,
				ids = [], 
				c, ui, p, id, tb, cnt;
				
			/* object with various utilits */	
			this.utils = new this.utils(this)
			/* DOM manipulation */
			this.dom = new this.dom(this);
			/* selection and text range object */
			this.selection = $.browser.msie ? new this.msSelection(this) : new this.selection(this);
			/* cleaning content object */
			this.filter = new this.filter(this)
			/* history object */
			this.history = new this.history(this);
			
			// init commands prototype
			this.command = new this.command(this);
			/* load commands */
			$.each(o.toolbars[o.toolbar]||[], function(i, p) {

				$.each(o.panels[p]||[], function(i, n) {
					
					if (typeof((c = self.commands[n])) == 'function' && !self._commands[n]) {
						c.prototype = self.command;
						c = new c();
						c.name = n;
						self._commands[n] = c.init(o.commandsConf[n]||{});
						// delete self._commands[n].init
					}
				});
			});

			if ((tb = o.toolbarType ? this.ui.toolbars[o.toolbarType] || this.ui.toolbars['normal'] : false)) {
				this.viewport.prepend(tb(this))
			}

			/* load plugins */
			$.browser.webkit && this.options.plugins.unshift('webkit');
			$.each(this.options.plugins, function(i, n) {
				if (typeof((p = self.plugins[n])) == 'function' && !self._plugins[n]) {
					self._plugins[n] = new p(self);
				}
			});
			
			/* init tabsbar */
			this.tabsbar.elrtetabsbar(this);
			/* load documents */
			this.open(this.options.documents);
			/* focus first/last document */
			if ((cnt = this.count()) > 0) {
				this.focus(this.documentByIndex(o.focusOpenedDoc ? cnt : 1).id);
			}

			/* bind to parent form save events */
			this.form.bind('submit', $.proxy(this.save, this));

			/* complete editor load */
			this.trigger('load');
			/* disable load event */
			delete(this.listeners.load);

			/* fix ff bug with carret position in textarea */
			if ($.browser.mozilla) {
				this.bind('source', function(e) {
					self.active.source[0].setSelectionRange(0,0);
				});
			}
			
			
			$(document).mousedown(function() {
				self.trigger('hideUI');
			});
			this.bind('mousedown', function() {
				self.trigger('hideUI');
			});
			
			// this.viewport.data('elrte', this)
			
			// this.log(this.viewport.data('elrte'))
			
			delete this.init;
		}
		
		
		
		/*******************************************************/
		/*                         Events                      */
		/*******************************************************/
		
		/**
		 * Bind callback to event(s)
		 * To bind multiply events at once, separate events names by space
		 *
		 * @param  String    event name
		 * @param  Function  callback
		 * @param  Boolean   put listener before others (on top)
		 * @return elRTE
		 */
		this.bind = function(e, c, t) {
			var l = this.listeners, e, i, n;

			if (typeof(c) == 'function') {
				e = $.trim(e).split(/\s+/);
				i = e.length;
				while (i--) {
					n = e[i];
					if (l[n] === void(0)) {
						l[n] = [];
					}
					l[n][t?'unshift':'push'](c);
				}
			}
			return this;
		}
		
		/**
		 * Remove event listener if exists
		 *
		 * @param  String    event name
		 * @param  Function  callback
		 * @return elRTE
		 */
		this.unbind = function(e, c) {
			var l = this.listeners[e] || [],
				i = l.indexOf(c);

			i>-1 && l.splice(i, 1);
			return this;
		}
		
		/**
		 * Bind callback to event(s) The callback is executed at most once per event.
		 * To bind multiply events at once, separate events names by space
		 *
		 * @param  String    event name
		 * @param  Function  callback
		 * @return elRTE
		 */
		this.one = function(e, c) {
			var self = this,
				h = $.proxy(c, function(e) {
					setTimeout(function() {self.unbind(e.type, h);}, 3);
					return c.apply(this, arguments);
				});
			return this.bind(e, h);
		}
		
		/**
		 * Bind keybord shortcut to keydown event
		 *
		 * @param  String    shortcut pattern in form: "ctrl+shift+z"
		 * @param  String    command name for exec trigger
		 * @param  String    shortcut description
		 * @param  Function  callback
		 * @return elRTE
		 */
		this.shortcut = function(pt, cmd, ds, cb) {
			var p = pt.toUpperCase().split('+'),
				l = p.length, 
				k = { keyCode : 0, ctrlKey : false, altKey : false, shiftKey : false, metaKey : false };
			
			while (l--) {
				switch (p[l]) {
					case 'CTRL'  : k.ctrlKey  = true; break;
					case 'ALT'   : k.altKey   = true; break;
					case 'SHIFT' : k.shiftKey = true; break;
					case 'META'  : k.metaKey  = true; break;
					default      : k.keyCode  = p[l].charCodeAt(0);
				}
			}
			if (k.keyCode>0 && (k.altKey||k.ctrlKey||k.metaKey) && typeof(cb) == 'function') {
				this.shortcuts[pt] = {
					pattern     : k, 
					callback    : cb, 
					cmd         : cmd,
					description : this.i18n(ds)
				};
				this.debug('shortcut', 'add '+pt);
			}
			return this;
		}
		
		/**
		 * Send notification to all event subscribers
		 *
		 * @param  String event name
		 * @param  Object extra parameters
		 * @return elRTE
		 */
		this.trigger = function(e, d) {
			var self = this, l;
			
			if (!e.type) {
				e = $.Event(''+e);
			}
			l = this.listeners[e.type]||[];
			// this.log(e.type)
			if (l.length) {
				e.data = $.extend({ id :  this.active ? this.active.id : '0'}, e.data||{}, d||{});
				this.debug('event.'+e.type,  (e.data.id||'no document')+' '+(l.length ? 'trigger' : 'no listeners'));
				$.each(l, function(i, c) {
					if (e.isPropagationStopped()) {
						return false;
					}
					c(e, d);
					// try {
					// 	c(e, d);
					// } catch (ex) {
					// 	self.log('trigger exeption. event: '+e.type)
					// }

				});
			}
			return this;
		}
		
		/*******************************************************/
		/*                 Documents manipuations              */
		/*******************************************************/
		
		/**
		 * @class doc
		 * Document constructor
		 * As document source accept DOM Element or plain object or string, 
		 * all other type will be treated as empty document
		 *
		 * @param  DOMElement|Object|String document source
		 * @param  elRTE editor instance
		 * @return void
		 */
		function doc(src, rte) {
			var o = rte.options,
				h = rte.workzone.height(),
				css = [],
				id, name, title, content, html, $src;

			this.rte      = rte;
			this.id       = '';
			this.ndx      = ++rte.ndx;
			this.title    = '';
			this.name     = '';
			this.source   = $('<textarea class="elrte-source"/>');
			this.editor   = $('<iframe frameborder="0" class="elrte-editor"/>');
			this.document = null;
			this.window   = null;
			this.view     = null;

			if (src.nodeType == 1 || $.isPlainObject(src)) {
				// document source is node or plain object
				id    = src.id;
				title = src.title;
				name  = src.name;
				if (src.nodeType == 1) {
					// content is node value or inner html
					$src    = $(src);
					content = $src.val() || $src.html();
					// css files list store as node attribute separated by space
					css  = ($src.attr('cssfiles')||'').split(/\n+/);
					if ($src.parents('form')[0] === rte.form[0]) {
						// if node belongs to the same form as editor -
						// remove name attribute to prevent duplicate form data on submit
						$src.removeAttr('name');
					}
				} else {
					content = src.content || '';
					// css files list should be an array
					css = $.isArray(src.cssfiles) ? src.cssfiles : [];
				}
			} else {
				// source is string or something else
				content = typeof(src) == 'string' ? src : '';
			}

			this.id    = id || rte.id+'-'+this.ndx;
			this.name  = name || this.id;
			this.title = title || rte.i18n('Document')+' '+this.ndx;
			this.source.attr('name', this.name).val(content);
			
			// check if document already loaded
			if (rte.documents[this.id]) {
				if (o.reopenDoc === false || o.reopenDoc == 'deny') {
					return rte.debug('error', 'Reopen document not allowed '+this.id)
				} else if (o.reopenDoc == 'ask') {
					if (confirm(rte.i18n('This document alreay opened. Do you want to reload it?'))) {
						// close document before reopen
						rte.focus(this.id).close(this.id);
					} else {
						return;
					}
				}
			}

			// load document into editor
			
			// add to documents array
			rte.documents[this.id] = this;
			
			// create document view and attach to editor
			this.view = $('<div id="'+this.id+'" class="elrte-document"/>')
				.append(this.editor.height(h))
				.append(this.source.height(h).hide())
				.hide()
				.appendTo(rte.workzone);
			// after iframe attached to DOM - get its window/document
			this.window   = this.editor[0].contentWindow;
			this.document = this.window.document;
			
			// create iframe html
			html = '<html xmlns="http://www.w3.org/1999/xhtml"><head><meta http-equiv="Content-Type" content="text/html; charset='+o.charset+'" />';
			$.each(o.cssfiles.concat(css), function(i, url) {
				if ((url = $.trim(url))) {
					html += '<link rel="stylesheet" type="text/css" href="'+url+'"/>';
				}
			});
			// write document body
			this.document.open();
			this.document.write(o.doctype+html+'</head><body>'+rte.filter.wysiwyg(this.source.val())+' </body></html>');
			this.document.close();
			this.body = this.document.body;
			
			// make iframe editable
			if ($.browser.msie) {
				this.document.body.contentEditable = true;
			} else {
				try { this.document.designMode = "on"; } 
				catch(e) { }
			}
			
			// bind events to document
			
			// rise cut/paste events on ctrl+x/v in opera, but not on mac :(
			// on mac opera think meta is a ctrl key
			// i hope only a few nerds use opera on mac :)
			// TODO test on linux/win
			if ($.browser.opera && !this.macos) {
				$(this.document).bind('keydown', function(e) {
					if ((e.keyCode == 88 || e.keyCode == 86) && e.ctrlKey) {
						e.stopPropagation();
						e.preventDefault();
						if (e.keyCode == 86 && !o.allowPaste) {
							return;
						}
						rte.trigger(e.keyCode == 88 ? 'cut' : 'paste');
					}
				});
			}
			
			$(this.document)
				.keydown(function(e) {
					var p, c = e.keyCode;
				
					rte.change  = false;
					rte.lastKey = rte.utils.keyType(e);
				
					// exec shortcut callback
					$.each(rte.shortcuts, function(n, s){
						p = s.pattern;
						if (p.keyCode == c && p.ctrlKey == e.ctrlKey && p.altKey == e.altKey && p.shiftKey == e.shiftKey && (p.meta ? p.metaKey == e.metaKey : true)) {
							e.stopPropagation();
							e.preventDefault();
							s.cmd && rte.trigger('exec', { cmd : s.cmd });
							s.callback(e) && rte.trigger('change', { cmd : s.cmd });
							return false;
						}
					});

					if (!e.isPropagationStopped()) {
						if (c == 9){
							// on tab pressed insert spaces
							// @todo - collapse before insertHtml?
							e.preventDefault();
							rte.selection.insertHtml("&nbsp;&nbsp;&nbsp;");
						} 
					
						if (rte.lastKey == rte.KEY_ENTER 
						||  rte.lastKey == rte.KEY_TAB 
						||  rte.lastKey == rte.KEY_DEL 
						|| (rte.lastKey == rte.KEY_CHAR && !rte.selection.collapsed())) {
							rte.trigger('exec');
							rte.change = true;
						} 
						rte.trigger(e);
					}
				})
				.keyup(function(e) {
					rte.trigger(e);
				
					if (rte.change) {
						rte.trigger('change', {event : e});
					} else if (rte.lastKey == rte.KEY_ARROW) {
						rte.trigger('changePos', {event : e});
					}
					rte.typing = rte.lastKey == rte.KEY_CHAR || rte.lastKey == rte.KEY_DEL;
					rte.lastKey = 0;
					rte.change = false;
				})
				.mouseup(function(e) {
					rte.lastKey = 0;
					rte.typing = false;
					// click on selection not collapse it at a moment
					setTimeout(function() { rte.trigger('changePos', {event : e}); }, 1);
				})
				.bind('mousedown mouseup click dblclick', function(e) {
					rte.trigger(e);
				})
				.bind('dragstart dragend drop', function(e) {
					// disable drag&drop
					if (!o.allowDragAndDrop) {
						e.preventDefault();
						e.stopPropagation();
					} else if (e.type == 'drop') {
						rte.trigger('change');
					}
				})
				.bind('cut', function(e) {
					rte.trigger('cut')
					setTimeout(function() { rte.trigger('change'); }, 5);
				})
				.bind('paste', function(e) {
					// paste handler
					if (!rte.options.allowPaste) {
						// paste denied 
						e.stopPropagation();
						e.preventDefault();
					} else {
						// create sandbox for paste, clean it content and unwrap
						var dom = rte.dom,
							sel = rte.selection,
							filter = rte.filter,
							a   = rte.active,
							n = dom.create({name : 'div', css : {position : 'absolute', left : '-10000px',top : '0', width : '1px', height : '1px', overflow : 'hidden' }}),
							r = dom.createTextNode(' _ ')
							;

						rte.trigger('paste');
						n.appendChild(r);
						n = sel.deleteContents().insertNode(n);
						sel.select(n.firstChild);
						setTimeout(function() {
							if (n.parentNode && !r.parentNode) {
								// clean sandbox content
								$(n).html(filter.proccess('paste', $(n).html()));
								r = n.lastChild;
								dom.unwrap(n);
								if (r) {
									sel.select(r).collapse(false);
								}
							} else {
								// smth wrong - clean all doc
								n.parentNode && n.parentNode.removeChild(n);
								a.val(filter.wysiwyg(a.val()));
								sel.select(a.document.body).collapse(true);
							}
							rte.trigger('change');
						}, 15);
					}
				});
			
			// trigger event for this document
			rte.trigger('open', { id : this.id });
			
			// hide doc source node if required
			if ($src && o.hideDocSource) {
				$src.hide();
			}
			
			// after editor was loaded, focus opened document if requied
			if (!rte.init && o.focusOpenedDoc) {
				rte.focus(this.id);
			}
		}
		
		/**
		 *
		 */
		doc.prototype.wysiwyg = function() {
			return this.editor.css('display') != 'none';
		}
		
		/**
		 *
		 */
		doc.prototype.focus = function() {
			this.wysiwyg() ? this.window.focus() : this.source[0].focus();
		}
		
		/**
		 *
		 */
		doc.prototype.toggle = function() {
			if (this.view.is(':visible') && this.rte.options.allowSource) {
				this.sync();
				this.editor.add(this.source).toggle();
			}
			return this;
		}

		/**
		 *
		 */
		doc.prototype.sync = function() {
			this.wysiwyg()
				? this.source.val(this.rte.filter.source($(this.body).html()))
				: $(this.body).html(this.rte.filter.wysiwyg(this.source.val()));
			return this;
		}
		
		/**
		 *
		 */
		doc.prototype.val = function(v) {
			var w = this.wysiwyg();
			
			if (v === void(0)) {
				return w 
					? this.rte.filter.source($(this.body).html()) 
					: this.rte.filter.source2source(this.source.val());
			} 
			
			
			w ? $(this.body).html(this.rte.filter.wysiwyg(v)) : this.source.val(this.rte.filter.source(v));
			this.focus();
			w && this.rte.trigger('change');
			return this;
		}
		
		/**
		 * Open document[s]
		 *
		 * @param Array|Object|DOMElement|jQuery|String  document[s] source
		 * @return elRTE
		 */
		this.open = function(d) {
			var self = this;

			if (d.jquery || $.isArray(d)) {
				$.each(d, function() {
					if (this.jquery) {
						this.each(function() {
							new doc(this, self);
						});
					} else {
						new doc(this, self);
					}
				})
			} else {
				new doc(d, this);
			}
			return this;
		}
		
		/**
		 * Close document
		 *
		 * @param String  document id
		 * @return elRTE
		 */
		this.close = function(id) {
			var d = this.document(id);

			if (d) {
				// switch to next/first document before close active one
				d == this.active && this.next();
				// rize event for closing document
				this.trigger('close', {id : d.id});
				// remove document view
				d.view.remove();
				// if close active document - unset link to it
				if (this.active.id == d.id) {
					this.active = null;
				}
				delete this.documents[d.id];
			}
			return this;
		}
		
		/**
		 * Set document active (visible) if it is not visible. 
		 * Give focus to document editor/source
		 *
		 * @param  String  document id
		 * @return elRTE
		 **/
		this.focus = function(id) {
			var d = this.document(id), 
				a = this.active;

			if (d) {
				if (d == a) { 
					// document already active
					// only give focus to it
					d.focus();
				} else { 
					// switch to another document
					// set active doc in wysiwyg mode if required before hide it
					a && !a.wysiwyg() && this.options.autoToggle && this.toggle();
					// show doc
					this.workzone.children('.elrte-document').hide().filter('#'+d.id).show();
					// set doc active
					this.active = d;
					// give focus to doc
					d.focus();
					// trigger event
					this.trigger(d.wysiwyg() ? 'wysiwyg' : 'source');
				}
			}
			return this;
		}
		
		/**
		 * Switch active document between editor and source mode if source access enabled
		 *
		 * @return elRTE
		 */
		this.toggle = function() {
			this.active && this.active.toggle();
			return this;
		}
		
		/**
		 * Return true if active document is in wysiwyg mode
		 *
		 * @return Boolean
		 **/
		this.isWysiwyg = function() {
			return this.active && this.active.wysiwyg();
		}
		
		/**
		 * Return number of loaded documents
		 *
		 * @return Number
		 **/
		this.count = function() {
			var i = 0;
			$.each(this.documents, function() {
				i++;
			});
			return i;
		}
		
		/**
		 * Return document by id
		 * If document not found return active document (or undefined if no documents loaded!)
		 *
		 * @param  String  document id (or undefined for active document)
		 * @return Object
		 **/
		this.document = function(id) {
			return this.documents[id]||this.active;
		}
		
		/**
		 * Return document by name
		 *
		 * @param  String  document name
		 * @return Object
		 **/
		this.documentByName = function(n) {
			var d;
			$.each(this.documents, function() {
				if (this.name == n) {
					d = this;
					return false;
				}
			});
			return d;
		}
		
		/**
		 * Return document by index
		 *
		 * @param  Number  document index
		 * @return Object
		 **/
		this.documentByIndex = function(n) {
			var d;
			$.each(this.documents, function() {
				if (this.ndx == n) {
					d = this;
					return false;
				}
			});
			return d;
		}
		
		
		/**
		 * Get/set editor content.
		 * Usage:
		 * this.val() - returns active document content
		 * this.val(id) - returns document with id content
		 * this.val('some text..') - set active document content
		 * this.val(id, 'some text..') - set document with id content
		 *
		 * @return String|Boolean
		 **/
		this.val = function() {
			var self = this,
				a    = arguments,
				d    = this.documents[a[0]],
				id   = this.active ? this.active.id : void(0), 
				c, o, d;

			function get(id) {
				return ((d = self.document(id)))
					? self.filter.proccess(d.wysiwyg() ? 'source' : 'source2source', d.get())
					: '';
			}
			
			function set(id, c) {
				if ((d = self.document(id))) {
					d.set(self.filter.proccess(d.wysiwyg() ? 'wysiwyg' : 'source', ''+c));
					d.focus();
					d == self.active && self.trigger('change', { id : d.id });
					return true;
				}
				return false;
			}
			
			if (a[0] !== void(0)) {
				if (d) {
					id = d.id;
					if (typeof(a[1]) !== void(0)) {
						c = a[1];
					}
				} else {
					c = arguments[0];
				}
			}
			return c ? set(id, c, o) : get(id, o);
		}
		
		/**
		 * Update textareas contents for required/all documents
		 * 
		 * @param  String  document id
		 * @return elRTE
		 */
		this.updateSource = function(id) {
			var self = this,
				d = this.documents;
			$.each(d[id] ? [d[id]] : d, function(i, d) {
				d.set(self.filter.proccess(w = d.wysiwyg() ? 'source' : 'source2source', d.get()), 'source');
			});
			return this;
		}
		
		/**
		 * Save editor documents
		 * If documents has own url for save - submit to this urls, others submit with parent form
		 *
		 * @param  Event
		 * @return void
		 */
		this.save = function(e) {
			var self = this, 
				url  = this.form.attr('action'), 
				t, f;
				
			if ((!e || !e.type) && this.form.length ) {
				return this.form.submit();
			} 

			self.updateSource();
			self.trigger('save');
			t = $('<iframe name="elrte_trg" style="position:absolute;left:-1000px"/>').appendTo('body');
			$.each(this.documents, function(i, d) {
				if (d.url && d.url != url) {
					f = $('<form action="'+d.url+'" method="'+(d.type||self.form.attr('method')||'post')+'" target="elrte_trg" />')
						.append(d.source)
						.appendTo('body')
						.submit();
				}
			});
			t.remove();
		}
		
		/**
		 * Return message translated into current language
		 *
		 * @param  String  message
		 * @return String
		 */
		this.i18n = function(m) {
			return this.messages[m]||m;
		}
		
		/**
		 * Return command options
		 *
		 * @param  String  command name
		 * @param  String  option name (if not set - return all config)
		 * @return String|Array
		 */
		this.commandConf = function(n, o) {
			var c = this.options['commandsConf'];
			return o ? (c && c[n] ? c[n][o] : false) : (c ? c[n] : false);
		}
		
		/**
		 * Return plugin options
		 *
		 * @param  String  plugin name
		 * @param  String  option name (if not set - return all config)
		 * @return String|Array
		 */
		this.pluginConf = function(n, o) {
			var c = this.options['pluginsConf'];
			return o ? (c && c[n] ? c[n][o] : false) : (c ? c[n] : false);
		}
		
		/**
		 * Exec editor method return result
		 * @TODO add obj.cmd call support
		 * @param  String  editor method name
		 * @return mixed
		 */
		this.exec = function(cmd) {
			var a = Array.prototype.slice.call(arguments);
			a.shift();
			
			return this[cmd] ? this[cmd].apply(this, a) : false;
			
			return this[cmd]
				? this[cmd].apply(this, a)
				: this._commands[cmd] ? this._commands[cmd].exec.apply(this._commands[cmd], a) : false;
		}
		
		/**
		 * Return true if command loaded in editor
		 *
		 * @param  String  command name
		 * @return Boolean
		 */
		this.cmdLoaded = function(cmd) {
			return !!this._commands[cmd];
		}
		
		/**
		 * Return curent command state (-1 : disable, 0 : enabled, 1 : active)
		 *
		 * @param  String  command name
		 * @return Number
		 */
		this.cmdState = function(cmd) {
			var c = this._commands[cmd]; 
			return c ? c.state() : -1;
		}
		
		/**
		 * Return true if command may be executed
		 *
		 * @param  String  command name
		 * @return Boolean
		 */
		this.cmdEnabled = function(cmd) {
			return this.cmdState() > -1;
		}
		
		/**
		 * Return command value if enabled
		 *
		 * @param  String  command name
		 * @return String
		 */
		this.cmdValue = function(cmd) {
			var c = this._commands[cmd]; 
			return c ? c.value() : false;
		}
		
		/**
		 * Exec command method "exec" and return result
		 *
		 * @param  String  editor command name
		 * @return mixed
		 */
		this.execCmd = function(cmd) {
			var c = this._commands[cmd],
				a = Array.prototype.slice.call(arguments);
			a.shift();
			return c ? c.exec.apply(c, a) : false;
		}
		
		
		
		
		
		
		/*******************************************************/
		/*                   View manipulations                */
		/*******************************************************/
		
		/**
		 * Switch to next document after active one
		 *
		 * @TODO add cmd+arrows shortcut
		 * @return elRTE
		 */
		this.next = function() {
			return this.focus(this.tabsbar.getNext());
		}
		
		/**
		 * Switch to previous document before active one
		 *
		 * @return elRTE
		 */
		this.prev = function() {
			return this.focus(this.tabsbar.getPrev());
		}
		
		/**
		 * Show editor if hidden
		 *
		 * @return elRTE
		 */
		this.show = function() {
			if (this.viewport.is(':visible')) {
				this.viewport.show();
				this.trigger('show');
			}
			return this;
		}
		
		/**
		 * Hide editor if visible
		 *
		 * @return elRTE
		 */
		this.hide = function() {
			if (this.viewport.is(':visible')) {
				this.viewport.hide();
				this.trigger('hide');
			}
			return this;
		}
		
		/**
		 * Close all documents and remove editor from DOM
		 *
		 * @return void
		 */
		this.destroy = function() {
			var self = this;
			
			$.each(this.documents, function() {
				self.close(this.id);
			});
			
			this.viewport.detach();
		}
		
		/*******************************************************/
		/*                        Debug                        */
		/*******************************************************/
		/**
		 * send message to console log
		 *
		 * @param String  message
		 */
		this.log = function(m) {
			window.console && window.console.log && window.console.log(m);
		}
		
		/**
		 * send message to console log if debug is enabled in config
		 *
		 * @param String  message group name
		 * @param String  message
		 */
		this.debug = function(n, m) {
			if (this.options.debug == 'all') {
				this.log(n+': '+m);
			} else if (this.options.debug.length) {
				var _n = n.split('.');
				if ($.inArray(n, this.options.debug) != -1 || (_n[0] && $.inArray(_n[0], this.options.debug) != -1) || (_n[1] && $.inArray(_n[1], this.options.debug) != -1)) {
					this.log(n+': '+m);
				}
			}
		}
		
		
		this.init();
		this.timeEnd('load');

	}

	elRTE.prototype._doc = function(src) {
		this.rte      = self;
		this.id       = '';
		this.title    = '';
		this.source   = null;
		this.editor   = null;
		this.document = null;
		this.window   = null;
		
	}

	elRTE.prototype._doc.prototype.test = function() {
		this.rte.log('test 2')
	}

	elRTE.prototype.time = function(l) {
		window.console && window.console.time && window.console.time(l);
	}
	
	elRTE.prototype.timeEnd = function(l) {
		window.console && window.console.timeEnd && window.console.timeEnd(l);
	}

	/**
	 * elRTE plugins classes
	 *
	 */
	elRTE.prototype.plugins = {};
	
	/**
	 * elRTE commands classes
	 *
	 */
	elRTE.prototype.commands = {};
	
	elRTE.prototype.mixins = {};
	
	/**
	 * elRTE ui
	 *
	 */
	elRTE.prototype.ui = {
		toolbars : {
			normal : function(rte) {
				return $('<div/>').elrtetoolbar(rte);
			}
		}, 
		buttons : {
			normal : function(cmd) {
				return $('<div/>').elrtebutton(cmd);
			}
		} 
	};	

	/**
	 * elRTE messages
	 *
	 */
	elRTE.prototype.i18Messages = {}


	/**
	 * Extend jQuery expressions.
	 * Find elements in set which has elRTE editor instance
	 *
	 * @examples
	 * Return only nodes with elRTE instances
	 *  $("selector:elrte")
	 */
	$.expr[':'].elrte = function(e) {
		var inst = $(e).data('elrte-editor');
		return !!(inst && inst.id);
	}
	
	/**
	 * jQuery plugin
	 * Find elRTE editor instances in elements set and create it if not found.
	 * WARNING!
	 * - Return set of elements with elRTE instances. If there is no one was found returns original set.
	 * - While create instance elRTE removes original node, so be carefull if you need this node after create elRTE instance on it
	 * - elRTE instance can be created only on node attached to page DOM
	 *
	 * @examples
	 * Create elrte editor[s]
	 *   $(selector).elrte(opts);
	 * Get elrte nodes set
	 *   var editors = $(selector).elrte();
	 * Exec command on first editor in set
	 *   var result = $(selector).elrte().exec(commandName, commandValue);
	 * Get editor instance from first element in set
	 *   var elrteInstance = $(selector).elrte().getEditor();
	 *
	 * @param Object  elRTE options
	 */
	$.fn.elrte = function(o) {
		
		var ids = [], // editors instances id
			ret;      // result elements set if at least one editor exists/created
		
		this.each(function() {
			var $this = $(this),
				inst, p;
			
			if ($this.is(':elrte')) {
				// element already has editor
				inst = $this.data('elrte-editor')
			} else if ((p = $this.parents(':elrte')).length) {
				// elRTE take away target node id for its document, so we need to test node parent
				inst = p.data('elrte-editor');
			} else {
				// create new instance
				inst = new elRTE(this, o);
				if (inst.id) {
					// store instance in editor container data
					inst.viewport.data('elrte-editor', inst);
				}
			}

			if (inst && inst.id) {
				ids.push(inst.id);
			}
		});


		if (ids.length) {
			// elrte editors exists - create set
			ret = $('#'+ids.join(',#'));
			
			// extend result set with methods
			return $.extend(ret, {
				/**
				 * Return first elrte instance from set
				 * @return elRTE
				 */
				getEditor : $.proxy(function() { 
					return this.filter(':elrte').eq(0).data('elrte-editor'); }, 
				ret),
				/**
				 * Call exec method on first elrte instance from set
				 * @return misc
				 */
				exec : $.proxy(function() {
					var inst = this.getEditor();
					if (inst) {
						return inst.exec.apply(inst, Array.prototype.slice.call(arguments));
					}
				}, ret)
			});
		} 

		return this;
	}
})(jQuery);