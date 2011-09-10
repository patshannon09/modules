
/*global window,jQuery */

"use strict";

var DrupalBookmarklet;

/**
 * DrupalBookmarklet
 * @constructor
 *
 * Constructor loads all the required scripts in a specific sequence. The jQuery
 * plugins must be loaded before the noConflict function is called or else they
 * may be attached to some other jQuery instance.
 */
DrupalBookmarklet = function (host, path) {
  this.host = host;
  this.path = path;
  this.settings = {};
  this.dialog = {};
  this.nodeType = '';

  this.createScript('http://ajax.googleapis.com/ajax/libs/jquery/1.4/jquery.min.js', function () {
    var ajaxOptions;

    ajaxOptions = {
      type: "GET",
      dataType: "script",
      context: this,
      global: false
    };

    // Load jQuery UI.
    $.ajax($.extend({
      url: 'http://ajax.googleapis.com/ajax/libs/jqueryui/1.8/jquery-ui.min.js',
      success: function () {

        $.ajax($.extend({

          // Load jQuery postMessage plugin.
          url: this.host + '/' + this.path + '/jquery-postmessage/jquery.ba-postmessage.min.js',
          success: function () {
            this.jQuery = jQuery.noConflict(true);
            this.setupBookmarklet();
          }
        }, ajaxOptions));

      }
    }, ajaxOptions));

  });
};

/**
 * @see jQuery.getScript()
 * @see jQuery.ajax()
 */
DrupalBookmarklet.prototype.createScript = function (src, callback) {
  var bookmarklet = this,
    head = document.getElementsByTagName("head")[0] || document.documentElement,
    script = document.createElement("script"),
    // Handle Script loading
    done = false;

  script.src = src;
  script.charset = "utf-8";

  // Attach handlers for all browsers
  script.onload = script.onreadystatechange = function () {
    if (!done && (!this.readyState ||
        this.readyState === "loaded" || this.readyState === "complete")) {
      done = true;
      callback.call(bookmarklet);

      // Handle memory leak in IE
      script.onload = script.onreadystatechange = null;
      if (head && script.parentNode) {
        head.removeChild(script);
      }
    }
  };

  // Use insertBefore instead of appendChild  to circumvent an IE6 bug.
  // This arises when a base node is used (#2709 and #4378).
  head.insertBefore(script, head.firstChild);
};

/**
 * Open mesage channel to iframe document, direct user to node form or login
 * form.
 */
DrupalBookmarklet.prototype.setupBookmarklet  = function () {
  var bookmarklet, $;
  bookmarklet = this;
  $ = this.jQuery;
  // newly loaded jQuery is attached to the bookmarklet object as the
  // jQuery method.
  this.setupMessageChannel();

  // Pull bookmarklet settings from Drupal callback.
  this.loadSettings(function () {
    var nodeType, params, url, settings;

    nodeType = bookmarklet.mapNodeType(location.href);
    params = {
      edit: bookmarklet.getPrepopulate(nodeType)
    };
    settings = bookmarklet.settings;
    bookmarklet.nodeType = nodeType;

    // Anonymous users without permission to create nodes should be directed to
    // the login form.
    if (settings.authenticated === false && settings.types.length === 0) {
      $.extend(params, {
        q: 'user/login',
        destination: 'node/add/' + nodeType
      });
    }
    else {
      $.extend(params, {
        q: 'node/add/' + nodeType
      });
    }
    url = bookmarklet.iframeUrl(params);
    bookmarklet.loadStylesheet(bookmarklet.settings.stylesheet);
    bookmarklet.createBookmarklet(url);

  });

};

/**
 * Load bookmarklet settings.
 */
DrupalBookmarklet.prototype.loadSettings = function (callback) {
  var bookmarklet, $, url, map;

  bookmarklet = this;
  $ = this.jQuery;
  url = this.host + '/?' + $.param({ q: 'bookmarklet/js' }) + '&callback=?';

  $.getJSON(url, function (json) {

    // Set instance settings.
    bookmarklet.settings = json;

    // Clone then empty URL map. It needs to be reconstituted as regexp objects.
    map = $.extend({}, bookmarklet.settings.urlMap);
    bookmarklet.settings.urlMap = [];

    $.each(map, function (exp, types) {
      var splits;
      splits = exp.split(exp.charAt(0));
      $.each(types, function (index, value) {
        bookmarklet.settings.urlMap.push({
          regexp: new RegExp(splits[1], splits[2]),
          type: value
        });
      });
    });

    callback();
  });
};

/**
 * Set up buttons.
 */
DrupalBookmarklet.prototype.setupButtons = function (container) {
  var $, bookmarklet;

  $ = this.jQuery;
  bookmarklet = this;

  container.empty();

  // Make UI Dialog buttons for each content type.
  $.each(this.settings.types, function (machineName, setting) {
    var tab = $('<a href="#"></a>')
      .addClass(
        'ui-state-default ' +
        'ui-dialog-titlebar-tab ' +
        'ui-corner-top ' +
        ((machineName === bookmarklet.nodeType) ? 'ui-state-active' : '')
      )
      .hover(function () {
        tab.addClass('ui-state-hover');
      },
      function () {
        tab.removeClass('ui-state-hover');
      })
      .focus(function () {
        tab.addClass('ui-state-focus');
      })
      .blur(function () {
        tab.removeClass('ui-state-focus');
      })
      .click(function (event) {
        var params;
        params = {
          q: 'node/add/' + machineName,
          edit: bookmarklet.getPrepopulate(machineName)
        };
        bookmarklet.nodeType = machineName;
        $('iframe', bookmarklet.dialog).attr('src', bookmarklet.iframeUrl(params));
      })
      .text(setting.name)
      .appendTo(container);
  });
};

/**
 * Set up message channel.
 *
 * @see https://developer.mozilla.org/en/DOM/window.postMessage
 */
DrupalBookmarklet.prototype.setupMessageChannel = function () {
  var $, parsedUrl;

  $ = this.jQuery;
  parsedUrl = this.parseUrl(this.host);

  $.receiveMessage(
    $.proxy(this, 'handleMessage'),
    parsedUrl.scheme + ":" + parsedUrl.slash + parsedUrl.host +
      (parsedUrl.port ? ':' + parsedUrl.port : '')
  );
};

/**
 * receive postMessage events.
 *
 * The message handler is designed to pass most of the events as methods to the
 * ui.dialog widget.
 *
 * @param   event   object - must contain a method property,
 *                  if it contains an optionName property, it must contain a
 *                  value property.
 */
DrupalBookmarklet.prototype.handleMessage = function (event) {
  var $, data, bookmarklet, css;

  $ = this.jQuery;
  data = {};
  bookmarklet = this;

  $.each(decodeURIComponent(event.data).replace(/\+/g, " ").split("&"), function () {
    data[this.split("=")[0]] = this.split("=")[1];
  });

  // Messages are designed to be passed straight through to the jQuery UI
  // widget. If option name is undefined, the message is triggering a widget
  // method.
  if (typeof(data.optionName) === "undefined") {

    switch (data.method) {
    case 'close':
      setTimeout(function () {
        bookmarklet.dialog.dialog(data.method);
      }, 5000);
      break;

    case 'loadSettings':
      this.loadSettings(function () {
      });
      break;

    default:
      this.dialog.dialog(data.method);
      break;
    }

  }
  else {
    switch (data.optionName) {

    // Height and width are put directly in the CSS of the dialog because
    // iframes are sensitive.
    case 'height':
    case 'width':
      css = {};
      css[data.optionName] = data.value;
      this.dialog.animate(css, 'fast', 'swing');
      break;

    case 'title':
      this.dialog.dialog(data.method, data.optionName, data.value);
      this.setupButtons($(".ui-dialog-title", this.dialog.data('dialog').uiDialogTitlebar));

      break;

    default:
      this.dialog.dialog(data.method, data.optionName, data.value);
      break;
    }
  }

};

/**
 * Get the current text selection.
 *
 * @see http://betterexplained.com/articles/how-to-make-a-bookmarklet-for-your-web-application/
 */
DrupalBookmarklet.prototype.getSelection = function () {
  var t;

  try {
    // get the currently selected text
    t = ((window.getSelection && window.getSelection()) ||
      (document.getSelection && document.getSelection()) ||
      (document.selection && document.selection.createRange &&
      document.selection.createRange().text));
  }
  catch (e) {
    // access denied on https sites
    t = "";
  }

  t = t.toString();

  if (t === "") {
    t = "";
  }

  return t;
};

/**
 * @param   {String} href a URI
 * @returns {String} node type from map or default.
 */
DrupalBookmarklet.prototype.mapNodeType = function (href) {
  var $, nodeType;

  $ = this.jQuery;
  nodeType = this.settings.defaultType;

  $.each(this.settings.urlMap, function (index, pattern) {
    if (pattern.regexp.test(href)) {
      nodeType = pattern.type;
      return false;
    }
  });

  return nodeType;
};

/**
 * @param   {String} href a URI
 * @returns {Object} keys are URI parts
 *
 * @see From Chapter 7 of JavaScript, the Good Parts.
 */
DrupalBookmarklet.prototype.parseUrl = function (href) {
  var $, urlRegex, result, names, parsedUrl;

  $ = this.jQuery;
  urlRegex = /^(?:([A-Za-z]+):)?(\/{0,3})([0-9.\-A-Za-z]+)(?::(\d+))?(?:\/([^?#]*))?(?:\?([^#]*))?(?:#(.*))?$/;
  result = urlRegex.exec(href);
  names = ['url', 'scheme', 'slash', 'host', 'port', 'path', 'query', 'hash'];
  parsedUrl = {};

  $.each(names, function (item, name) {
    parsedUrl[name] = result[item];
  });

  return parsedUrl;
};

/**
 * @param {String} nodeType machine name of a node type.
 * @returns {Object} keys are FormAPI elements, will be sent through $.params().
 */
DrupalBookmarklet.prototype.getPrepopulate = function (nodeType) {
  var prepopulate, values, $, prepopulateMap;

  $ = this.jQuery;

  values = {
    title: document.title,
    href: location.href,
    selection: this.getSelection()
  };

  prepopulateMap = function (map) {
    var ret = {};

    $.each(map, function (key, value) {
      ret[key] = (typeof value === 'string') ? values[value] : prepopulateMap(value);
    });

    return ret;
  };

  // If the default node type isn't part of the allowed types in the settings
  // use a basic default map.
  prepopulate = this.settings.types.hasOwnProperty(nodeType) ?
    this.settings.types[nodeType].prepopulate : {
      title: 'title',
      body_field: { body: 'selection' }
    };

  return prepopulateMap(prepopulate);
};

/**
 * @param {String|Object} path string becomes the 'q' GET parameter.
 * @returns {String} absolute path
 */
DrupalBookmarklet.prototype.iframeUrl = function (path) {
  var $, params;

  $ = this.jQuery;
  params = {
    bookmarklet: true,
    origin: location.href
  };

  if (typeof path === "string") {
    $.extend(params, { q: path });
  }
  else if (typeof path === "object") {
    $.extend(params, path);
  }

  return this.host + '/?' + $.param(params) + this.settings.constant;
};

/**
 * Loads a stylesheet.
 *
 * @param {String} url
 */
DrupalBookmarklet.prototype.loadStylesheet = function (url) {
  var $;

  $ = this.jQuery;

  $('<link/>', {
      href: url,
      rel: 'stylesheet',
      type: 'text/css',
      media: 'screen'
    })
    .appendTo('head');
};

/**
 * Opens a new dialog and creates the iframe contents.
 *
 * @param {String} url from iframeUrl().
 */
DrupalBookmarklet.prototype.createBookmarklet = function (url) {
  var $, dialog, loading;

  $ = this.jQuery;

  loading = $('<div/>', {
      'class': 'bookmarklet-loading'
    })
    .appendTo('body');

  dialog = $('<div/>', {
      css: {
        overflow: 'visible',
        padding: 0
      }
    })
    .append($('<iframe/>', {
      src: url,
      frameborder: 0,
      scrolling: 'auto',
      css: {
        width: '100%',
        height: '100%',
        border: '0px',
        padding: '0px',
        margin: '0px'
      },
      load: function () {
        loading.remove();
        dialog.dialog('open');
        $(this).unbind('load');
      }
    }))
    .dialog({
      show: 'fade',
      hide: 'fade',
      modal: true,
      autoOpen: false,
      dialogClass: 'drupal-bookmarklet',
      draggable: false,
      resizable: false,
      width: '600px',
      height: $(window).height() * 0.8
    });

  this.dialog = dialog;
};

/**
 * When the dialog has already been opened but the page isn't refreshed, this
 * function is called to reopen the dialog.
 */
DrupalBookmarklet.prototype.reOpen = function () {
  var $, nodeType, path;

  $ = this.jQuery;
  nodeType = this.mapNodeType(location.href);
  path = {
    q: 'node/add/' + nodeType,
    edit: this.getPrepopulate(nodeType)
  };

  this.nodeType = nodeType;

  // If the dialog has already been open, refresh the src URL of the iframe to
  // fill in the form with new values.
  $('iframe', this.dialog).attr('src', this.iframeUrl(path));

  if (!this.dialog.dialog('isOpen')) {
    this.dialog.dialog('open');
  }
};

/*jslint white: true, browser: true, devel: true, onevar: true, undef: true, nomen: true, eqeqeq: true, plusplus: true, bitwise: true, strict: true, newcap: true, immed: true, indent: 2 */
