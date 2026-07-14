var CesiumMcpBridge = (function (exports) {
  'use strict';

  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    __defProp(target, "default", { value: mod, enumerable: true }) ,
    mod
  ));

  // cesium-global:cesium
  var require_cesium = __commonJS({
    "cesium-global:cesium"(exports$1, module) {
      module.exports = globalThis.Cesium;
    }
  });

  // ../../node_modules/heatmap.js/build/heatmap.js
  var require_heatmap = __commonJS({
    "../../node_modules/heatmap.js/build/heatmap.js"(exports$1, module) {
      (function(name, context, factory) {
        if (typeof module !== "undefined" && module.exports) {
          module.exports = factory();
        } else if (typeof define === "function" && define.amd) {
          define(factory);
        } else {
          context[name] = factory();
        }
      })("h337", exports$1, function() {
        var HeatmapConfig = {
          defaultRadius: 40,
          defaultRenderer: "canvas2d",
          defaultGradient: { 0.25: "rgb(0,0,255)", 0.55: "rgb(0,255,0)", 0.85: "yellow", 1: "rgb(255,0,0)" },
          defaultMaxOpacity: 1,
          defaultMinOpacity: 0,
          defaultBlur: 0.85,
          defaultXField: "x",
          defaultYField: "y",
          defaultValueField: "value",
          plugins: {}
        };
        var Store = (function StoreClosure() {
          var Store2 = function Store3(config) {
            this._coordinator = {};
            this._data = [];
            this._radi = [];
            this._min = 10;
            this._max = 1;
            this._xField = config["xField"] || config.defaultXField;
            this._yField = config["yField"] || config.defaultYField;
            this._valueField = config["valueField"] || config.defaultValueField;
            if (config["radius"]) {
              this._cfgRadius = config["radius"];
            }
          };
          var defaultRadius = HeatmapConfig.defaultRadius;
          Store2.prototype = {
            // when forceRender = false -> called from setData, omits renderall event
            _organiseData: function(dataPoint, forceRender) {
              var x = dataPoint[this._xField];
              var y = dataPoint[this._yField];
              var radi = this._radi;
              var store = this._data;
              var max = this._max;
              var min = this._min;
              var value = dataPoint[this._valueField] || 1;
              var radius = dataPoint.radius || this._cfgRadius || defaultRadius;
              if (!store[x]) {
                store[x] = [];
                radi[x] = [];
              }
              if (!store[x][y]) {
                store[x][y] = value;
                radi[x][y] = radius;
              } else {
                store[x][y] += value;
              }
              var storedVal = store[x][y];
              if (storedVal > max) {
                if (!forceRender) {
                  this._max = storedVal;
                } else {
                  this.setDataMax(storedVal);
                }
                return false;
              } else if (storedVal < min) {
                if (!forceRender) {
                  this._min = storedVal;
                } else {
                  this.setDataMin(storedVal);
                }
                return false;
              } else {
                return {
                  x,
                  y,
                  value,
                  radius,
                  min,
                  max
                };
              }
            },
            _unOrganizeData: function() {
              var unorganizedData = [];
              var data = this._data;
              var radi = this._radi;
              for (var x in data) {
                for (var y in data[x]) {
                  unorganizedData.push({
                    x,
                    y,
                    radius: radi[x][y],
                    value: data[x][y]
                  });
                }
              }
              return {
                min: this._min,
                max: this._max,
                data: unorganizedData
              };
            },
            _onExtremaChange: function() {
              this._coordinator.emit("extremachange", {
                min: this._min,
                max: this._max
              });
            },
            addData: function() {
              if (arguments[0].length > 0) {
                var dataArr = arguments[0];
                var dataLen = dataArr.length;
                while (dataLen--) {
                  this.addData.call(this, dataArr[dataLen]);
                }
              } else {
                var organisedEntry = this._organiseData(arguments[0], true);
                if (organisedEntry) {
                  if (this._data.length === 0) {
                    this._min = this._max = organisedEntry.value;
                  }
                  this._coordinator.emit("renderpartial", {
                    min: this._min,
                    max: this._max,
                    data: [organisedEntry]
                  });
                }
              }
              return this;
            },
            setData: function(data) {
              var dataPoints = data.data;
              var pointsLen = dataPoints.length;
              this._data = [];
              this._radi = [];
              for (var i = 0; i < pointsLen; i++) {
                this._organiseData(dataPoints[i], false);
              }
              this._max = data.max;
              this._min = data.min || 0;
              this._onExtremaChange();
              this._coordinator.emit("renderall", this._getInternalData());
              return this;
            },
            removeData: function() {
            },
            setDataMax: function(max) {
              this._max = max;
              this._onExtremaChange();
              this._coordinator.emit("renderall", this._getInternalData());
              return this;
            },
            setDataMin: function(min) {
              this._min = min;
              this._onExtremaChange();
              this._coordinator.emit("renderall", this._getInternalData());
              return this;
            },
            setCoordinator: function(coordinator) {
              this._coordinator = coordinator;
            },
            _getInternalData: function() {
              return {
                max: this._max,
                min: this._min,
                data: this._data,
                radi: this._radi
              };
            },
            getData: function() {
              return this._unOrganizeData();
            }
            /*,
            
                  TODO: rethink.
            
                getValueAt: function(point) {
                  var value;
                  var radius = 100;
                  var x = point.x;
                  var y = point.y;
                  var data = this._data;
            
                  if (data[x] && data[x][y]) {
                    return data[x][y];
                  } else {
                    var values = [];
                    // radial search for datapoints based on default radius
                    for(var distance = 1; distance < radius; distance++) {
                      var neighbors = distance * 2 +1;
                      var startX = x - distance;
                      var startY = y - distance;
            
                      for(var i = 0; i < neighbors; i++) {
                        for (var o = 0; o < neighbors; o++) {
                          if ((i == 0 || i == neighbors-1) || (o == 0 || o == neighbors-1)) {
                            if (data[startY+i] && data[startY+i][startX+o]) {
                              values.push(data[startY+i][startX+o]);
                            }
                          } else {
                            continue;
                          } 
                        }
                      }
                    }
                    if (values.length > 0) {
                      return Math.max.apply(Math, values);
                    }
                  }
                  return false;
                }*/
          };
          return Store2;
        })();
        var Canvas2dRenderer = (function Canvas2dRendererClosure() {
          var _getColorPalette = function(config) {
            var gradientConfig = config.gradient || config.defaultGradient;
            var paletteCanvas = document.createElement("canvas");
            var paletteCtx = paletteCanvas.getContext("2d");
            paletteCanvas.width = 256;
            paletteCanvas.height = 1;
            var gradient = paletteCtx.createLinearGradient(0, 0, 256, 1);
            for (var key in gradientConfig) {
              gradient.addColorStop(key, gradientConfig[key]);
            }
            paletteCtx.fillStyle = gradient;
            paletteCtx.fillRect(0, 0, 256, 1);
            return paletteCtx.getImageData(0, 0, 256, 1).data;
          };
          var _getPointTemplate = function(radius, blurFactor) {
            var tplCanvas = document.createElement("canvas");
            var tplCtx = tplCanvas.getContext("2d");
            var x = radius;
            var y = radius;
            tplCanvas.width = tplCanvas.height = radius * 2;
            if (blurFactor == 1) {
              tplCtx.beginPath();
              tplCtx.arc(x, y, radius, 0, 2 * Math.PI, false);
              tplCtx.fillStyle = "rgba(0,0,0,1)";
              tplCtx.fill();
            } else {
              var gradient = tplCtx.createRadialGradient(x, y, radius * blurFactor, x, y, radius);
              gradient.addColorStop(0, "rgba(0,0,0,1)");
              gradient.addColorStop(1, "rgba(0,0,0,0)");
              tplCtx.fillStyle = gradient;
              tplCtx.fillRect(0, 0, 2 * radius, 2 * radius);
            }
            return tplCanvas;
          };
          var _prepareData = function(data) {
            var renderData = [];
            var min = data.min;
            var max = data.max;
            var radi = data.radi;
            var data = data.data;
            var xValues = Object.keys(data);
            var xValuesLen = xValues.length;
            while (xValuesLen--) {
              var xValue = xValues[xValuesLen];
              var yValues = Object.keys(data[xValue]);
              var yValuesLen = yValues.length;
              while (yValuesLen--) {
                var yValue = yValues[yValuesLen];
                var value = data[xValue][yValue];
                var radius = radi[xValue][yValue];
                renderData.push({
                  x: xValue,
                  y: yValue,
                  value,
                  radius
                });
              }
            }
            return {
              min,
              max,
              data: renderData
            };
          };
          function Canvas2dRenderer2(config) {
            var container = config.container;
            var shadowCanvas = this.shadowCanvas = document.createElement("canvas");
            var canvas = this.canvas = config.canvas || document.createElement("canvas");
            this._renderBoundaries = [1e4, 1e4, 0, 0];
            var computed = getComputedStyle(config.container) || {};
            canvas.className = "heatmap-canvas";
            this._width = canvas.width = shadowCanvas.width = config.width || +computed.width.replace(/px/, "");
            this._height = canvas.height = shadowCanvas.height = config.height || +computed.height.replace(/px/, "");
            this.shadowCtx = shadowCanvas.getContext("2d");
            this.ctx = canvas.getContext("2d");
            canvas.style.cssText = shadowCanvas.style.cssText = "position:absolute;left:0;top:0;";
            container.style.position = "relative";
            container.appendChild(canvas);
            this._palette = _getColorPalette(config);
            this._templates = {};
            this._setStyles(config);
          }
          Canvas2dRenderer2.prototype = {
            renderPartial: function(data) {
              if (data.data.length > 0) {
                this._drawAlpha(data);
                this._colorize();
              }
            },
            renderAll: function(data) {
              this._clear();
              if (data.data.length > 0) {
                this._drawAlpha(_prepareData(data));
                this._colorize();
              }
            },
            _updateGradient: function(config) {
              this._palette = _getColorPalette(config);
            },
            updateConfig: function(config) {
              if (config["gradient"]) {
                this._updateGradient(config);
              }
              this._setStyles(config);
            },
            setDimensions: function(width, height) {
              this._width = width;
              this._height = height;
              this.canvas.width = this.shadowCanvas.width = width;
              this.canvas.height = this.shadowCanvas.height = height;
            },
            _clear: function() {
              this.shadowCtx.clearRect(0, 0, this._width, this._height);
              this.ctx.clearRect(0, 0, this._width, this._height);
            },
            _setStyles: function(config) {
              this._blur = config.blur == 0 ? 0 : config.blur || config.defaultBlur;
              if (config.backgroundColor) {
                this.canvas.style.backgroundColor = config.backgroundColor;
              }
              this._width = this.canvas.width = this.shadowCanvas.width = config.width || this._width;
              this._height = this.canvas.height = this.shadowCanvas.height = config.height || this._height;
              this._opacity = (config.opacity || 0) * 255;
              this._maxOpacity = (config.maxOpacity || config.defaultMaxOpacity) * 255;
              this._minOpacity = (config.minOpacity || config.defaultMinOpacity) * 255;
              this._useGradientOpacity = !!config.useGradientOpacity;
            },
            _drawAlpha: function(data) {
              var min = this._min = data.min;
              var max = this._max = data.max;
              var data = data.data || [];
              var dataLen = data.length;
              var blur = 1 - this._blur;
              while (dataLen--) {
                var point = data[dataLen];
                var x = point.x;
                var y = point.y;
                var radius = point.radius;
                var value = Math.min(point.value, max);
                var rectX = x - radius;
                var rectY = y - radius;
                var shadowCtx = this.shadowCtx;
                var tpl;
                if (!this._templates[radius]) {
                  this._templates[radius] = tpl = _getPointTemplate(radius, blur);
                } else {
                  tpl = this._templates[radius];
                }
                var templateAlpha = (value - min) / (max - min);
                shadowCtx.globalAlpha = templateAlpha < 0.01 ? 0.01 : templateAlpha;
                shadowCtx.drawImage(tpl, rectX, rectY);
                if (rectX < this._renderBoundaries[0]) {
                  this._renderBoundaries[0] = rectX;
                }
                if (rectY < this._renderBoundaries[1]) {
                  this._renderBoundaries[1] = rectY;
                }
                if (rectX + 2 * radius > this._renderBoundaries[2]) {
                  this._renderBoundaries[2] = rectX + 2 * radius;
                }
                if (rectY + 2 * radius > this._renderBoundaries[3]) {
                  this._renderBoundaries[3] = rectY + 2 * radius;
                }
              }
            },
            _colorize: function() {
              var x = this._renderBoundaries[0];
              var y = this._renderBoundaries[1];
              var width = this._renderBoundaries[2] - x;
              var height = this._renderBoundaries[3] - y;
              var maxWidth = this._width;
              var maxHeight = this._height;
              var opacity = this._opacity;
              var maxOpacity = this._maxOpacity;
              var minOpacity = this._minOpacity;
              var useGradientOpacity = this._useGradientOpacity;
              if (x < 0) {
                x = 0;
              }
              if (y < 0) {
                y = 0;
              }
              if (x + width > maxWidth) {
                width = maxWidth - x;
              }
              if (y + height > maxHeight) {
                height = maxHeight - y;
              }
              var img = this.shadowCtx.getImageData(x, y, width, height);
              var imgData = img.data;
              var len = imgData.length;
              var palette = this._palette;
              for (var i = 3; i < len; i += 4) {
                var alpha = imgData[i];
                var offset = alpha * 4;
                if (!offset) {
                  continue;
                }
                var finalAlpha;
                if (opacity > 0) {
                  finalAlpha = opacity;
                } else {
                  if (alpha < maxOpacity) {
                    if (alpha < minOpacity) {
                      finalAlpha = minOpacity;
                    } else {
                      finalAlpha = alpha;
                    }
                  } else {
                    finalAlpha = maxOpacity;
                  }
                }
                imgData[i - 3] = palette[offset];
                imgData[i - 2] = palette[offset + 1];
                imgData[i - 1] = palette[offset + 2];
                imgData[i] = useGradientOpacity ? palette[offset + 3] : finalAlpha;
              }
              this.ctx.putImageData(img, x, y);
              this._renderBoundaries = [1e3, 1e3, 0, 0];
            },
            getValueAt: function(point) {
              var value;
              var shadowCtx = this.shadowCtx;
              var img = shadowCtx.getImageData(point.x, point.y, 1, 1);
              var data = img.data[3];
              var max = this._max;
              var min = this._min;
              value = Math.abs(max - min) * (data / 255) >> 0;
              return value;
            },
            getDataURL: function() {
              return this.canvas.toDataURL();
            }
          };
          return Canvas2dRenderer2;
        })();
        var Renderer = (function RendererClosure() {
          var rendererFn = false;
          if (HeatmapConfig["defaultRenderer"] === "canvas2d") {
            rendererFn = Canvas2dRenderer;
          }
          return rendererFn;
        })();
        var Util = {
          merge: function() {
            var merged = {};
            var argsLen = arguments.length;
            for (var i = 0; i < argsLen; i++) {
              var obj = arguments[i];
              for (var key in obj) {
                merged[key] = obj[key];
              }
            }
            return merged;
          }
        };
        var Heatmap = (function HeatmapClosure() {
          var Coordinator = (function CoordinatorClosure() {
            function Coordinator2() {
              this.cStore = {};
            }
            Coordinator2.prototype = {
              on: function(evtName, callback, scope) {
                var cStore = this.cStore;
                if (!cStore[evtName]) {
                  cStore[evtName] = [];
                }
                cStore[evtName].push((function(data) {
                  return callback.call(scope, data);
                }));
              },
              emit: function(evtName, data) {
                var cStore = this.cStore;
                if (cStore[evtName]) {
                  var len = cStore[evtName].length;
                  for (var i = 0; i < len; i++) {
                    var callback = cStore[evtName][i];
                    callback(data);
                  }
                }
              }
            };
            return Coordinator2;
          })();
          var _connect = function(scope) {
            var renderer = scope._renderer;
            var coordinator = scope._coordinator;
            var store = scope._store;
            coordinator.on("renderpartial", renderer.renderPartial, renderer);
            coordinator.on("renderall", renderer.renderAll, renderer);
            coordinator.on("extremachange", function(data) {
              scope._config.onExtremaChange && scope._config.onExtremaChange({
                min: data.min,
                max: data.max,
                gradient: scope._config["gradient"] || scope._config["defaultGradient"]
              });
            });
            store.setCoordinator(coordinator);
          };
          function Heatmap2() {
            var config = this._config = Util.merge(HeatmapConfig, arguments[0] || {});
            this._coordinator = new Coordinator();
            if (config["plugin"]) {
              var pluginToLoad = config["plugin"];
              if (!HeatmapConfig.plugins[pluginToLoad]) {
                throw new Error("Plugin '" + pluginToLoad + "' not found. Maybe it was not registered.");
              } else {
                var plugin = HeatmapConfig.plugins[pluginToLoad];
                this._renderer = new plugin.renderer(config);
                this._store = new plugin.store(config);
              }
            } else {
              this._renderer = new Renderer(config);
              this._store = new Store(config);
            }
            _connect(this);
          }
          Heatmap2.prototype = {
            addData: function() {
              this._store.addData.apply(this._store, arguments);
              return this;
            },
            removeData: function() {
              this._store.removeData && this._store.removeData.apply(this._store, arguments);
              return this;
            },
            setData: function() {
              this._store.setData.apply(this._store, arguments);
              return this;
            },
            setDataMax: function() {
              this._store.setDataMax.apply(this._store, arguments);
              return this;
            },
            setDataMin: function() {
              this._store.setDataMin.apply(this._store, arguments);
              return this;
            },
            configure: function(config) {
              this._config = Util.merge(this._config, config);
              this._renderer.updateConfig(this._config);
              this._coordinator.emit("renderall", this._store._getInternalData());
              return this;
            },
            repaint: function() {
              this._coordinator.emit("renderall", this._store._getInternalData());
              return this;
            },
            getData: function() {
              return this._store.getData();
            },
            getDataURL: function() {
              return this._renderer.getDataURL();
            },
            getValueAt: function(point) {
              if (this._store.getValueAt) {
                return this._store.getValueAt(point);
              } else if (this._renderer.getValueAt) {
                return this._renderer.getValueAt(point);
              } else {
                return null;
              }
            }
          };
          return Heatmap2;
        })();
        var heatmapFactory = {
          create: function(config) {
            return new Heatmap(config);
          },
          register: function(pluginKey, plugin) {
            HeatmapConfig.plugins[pluginKey] = plugin;
          }
        };
        return heatmapFactory;
      });
    }
  });

  // src/bridge.ts
  var Cesium11 = __toESM(require_cesium());

  // src/commands/view.ts
  var Cesium2 = __toESM(require_cesium());

  // src/utils.ts
  var Cesium = __toESM(require_cesium());
  function parseColor(input) {
    if (typeof input === "string") {
      return Cesium.Color.fromCssColorString(input);
    }
    return new Cesium.Color(input.red, input.green, input.blue, input.alpha ?? 1);
  }
  function resolveMaterial(input) {
    if (!input) return Cesium.Color.WHITE;
    if (typeof input === "string" || "red" in input) return parseColor(input);
    const spec = input;
    switch (spec.type) {
      case "color":
        return spec.color ? parseColor(spec.color) : Cesium.Color.WHITE;
      case "image":
        return new Cesium.ImageMaterialProperty({ image: spec.image });
      case "checkerboard":
        return new Cesium.CheckerboardMaterialProperty({
          evenColor: spec.evenColor ? parseColor(spec.evenColor) : void 0,
          oddColor: spec.oddColor ? parseColor(spec.oddColor) : void 0
        });
      case "stripe":
        return new Cesium.StripeMaterialProperty({
          orientation: spec.orientation === "vertical" ? Cesium.StripeOrientation.VERTICAL : Cesium.StripeOrientation.HORIZONTAL,
          evenColor: spec.evenColor ? parseColor(spec.evenColor) : void 0,
          oddColor: spec.oddColor ? parseColor(spec.oddColor) : void 0
        });
      case "grid":
        return new Cesium.GridMaterialProperty({
          color: spec.color ? parseColor(spec.color) : void 0,
          cellAlpha: spec.cellAlpha
        });
      default:
        return Cesium.Color.WHITE;
    }
  }
  function resolveOrientation(position, orientation) {
    const hpr = Cesium.HeadingPitchRoll.fromDegrees(
      orientation.heading,
      orientation.pitch,
      orientation.roll
    );
    return Cesium.Transforms.headingPitchRollQuaternion(position, hpr);
  }
  function validateCoordinate(longitude, latitude, height) {
    if (longitude < -180 || longitude > 180) {
      throw new RangeError(`\u7ECF\u5EA6\u8D85\u51FA\u8303\u56F4 [-180, 180]: ${longitude}`);
    }
    if (latitude < -90 || latitude > 90) {
      throw new RangeError(`\u7EAC\u5EA6\u8D85\u51FA\u8303\u56F4 [-90, 90]: ${latitude}`);
    }
    if (height !== void 0 && height < -12e3) {
      throw new RangeError(`\u9AD8\u5EA6\u5F02\u5E38 (< -12000m): ${height}`);
    }
  }

  // src/commands/view.ts
  function _heightToRange(height, pitchDeg) {
    const absSin = Math.abs(Math.sin(Cesium2.Math.toRadians(pitchDeg)));
    return absSin > 0.05 ? height / absSin : height * 10;
  }
  function flyTo(viewer, params) {
    const {
      longitude,
      latitude,
      height = 5e4,
      heading = 0,
      pitch = -45,
      duration = 2
    } = params;
    validateCoordinate(longitude, latitude, height);
    const target = Cesium2.Cartesian3.fromDegrees(longitude, latitude, 0);
    const range = _heightToRange(height, pitch);
    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(fallback);
        resolve();
      };
      const fallback = setTimeout(done, (duration + 1) * 1e3);
      viewer.camera.flyToBoundingSphere(new Cesium2.BoundingSphere(target, 0), {
        duration,
        offset: new Cesium2.HeadingPitchRange(
          Cesium2.Math.toRadians(heading),
          Cesium2.Math.toRadians(pitch),
          range
        ),
        complete: done,
        cancel: done
      });
    });
  }
  function setView(viewer, params) {
    const { longitude, latitude, height = 5e4, heading = 0, pitch = -45 } = params;
    validateCoordinate(longitude, latitude, height);
    const target = Cesium2.Cartesian3.fromDegrees(longitude, latitude, 0);
    const range = _heightToRange(height, pitch);
    viewer.camera.lookAt(
      target,
      new Cesium2.HeadingPitchRange(
        Cesium2.Math.toRadians(heading),
        Cesium2.Math.toRadians(pitch),
        range
      )
    );
    viewer.camera.lookAtTransform(Cesium2.Matrix4.IDENTITY);
  }
  function getView(viewer) {
    const carto = viewer.camera.positionCartographic;
    return {
      longitude: Cesium2.Math.toDegrees(carto.longitude),
      latitude: Cesium2.Math.toDegrees(carto.latitude),
      height: carto.height,
      heading: Cesium2.Math.toDegrees(viewer.camera.heading),
      pitch: Cesium2.Math.toDegrees(viewer.camera.pitch),
      roll: Cesium2.Math.toDegrees(viewer.camera.roll)
    };
  }
  function zoomToExtent(viewer, params) {
    const { bbox, duration = 1.5 } = params;
    const [west, south, east, north] = bbox;
    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(fallback);
        resolve();
      };
      const fallback = setTimeout(done, (duration + 1) * 1e3);
      viewer.camera.flyTo({
        destination: Cesium2.Rectangle.fromDegrees(west, south, east, north),
        duration,
        complete: done,
        cancel: done
      });
    });
  }
  var _viewpoints = /* @__PURE__ */ new Map();
  function saveViewpoint(viewer, params) {
    const state = getView(viewer);
    _viewpoints.set(params.name, state);
    return state;
  }
  function loadViewpoint(viewer, params) {
    const state = _viewpoints.get(params.name);
    if (!state) return null;
    const duration = params.duration ?? 2;
    if (duration > 0) {
      flyTo(viewer, { ...state, duration });
    } else {
      setView(viewer, state);
    }
    return state;
  }
  function listViewpoints() {
    return Array.from(_viewpoints.entries()).map(([name, state]) => ({ name, state }));
  }

  // src/commands/layer.ts
  var Cesium3 = __toESM(require_cesium());
  var import_heatmap = __toESM(require_heatmap());

  // src/commands/basemap-presets.ts
  var TDT_SUBDOMAINS = ["0", "1", "2", "3", "4", "5", "6", "7"];
  var AMAP_SUBDOMAINS = ["1", "2", "3", "4"];
  var BASEMAP_PRESETS = {
    dark: {
      layers: () => [{ url: "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png", maximumLevel: 18 }],
      backgroundColor: "#0B1120"
    },
    satellite: {
      layers: () => [{ url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", maximumLevel: 18 }]
    },
    standard: {
      layers: () => [{ url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", maximumLevel: 19 }]
    },
    osm: {
      layers: () => [{ url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", maximumLevel: 19 }]
    },
    arcgis: {
      layers: () => [{ url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", maximumLevel: 18 }]
    },
    light: {
      layers: () => [{ url: "https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png", maximumLevel: 18 }]
    },
    tianditu_vec: {
      layers: (tk) => [
        { url: `https://t{s}.tianditu.gov.cn/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${tk}`, subdomains: TDT_SUBDOMAINS, maximumLevel: 18 },
        { url: `https://t{s}.tianditu.gov.cn/cva_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cva&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${tk}`, subdomains: TDT_SUBDOMAINS, maximumLevel: 18 }
      ]
    },
    tianditu_img: {
      layers: (tk) => [
        { url: `https://t{s}.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${tk}`, subdomains: TDT_SUBDOMAINS, maximumLevel: 18 },
        { url: `https://t{s}.tianditu.gov.cn/cia_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cia&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${tk}`, subdomains: TDT_SUBDOMAINS, maximumLevel: 18 }
      ]
    },
    amap: {
      layers: () => [
        { url: "https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}", subdomains: AMAP_SUBDOMAINS, maximumLevel: 18 }
      ]
    },
    amap_satellite: {
      layers: () => [
        { url: "https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}", subdomains: AMAP_SUBDOMAINS, maximumLevel: 18 },
        { url: "https://webst0{s}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}", subdomains: AMAP_SUBDOMAINS, maximumLevel: 18 }
      ]
    }
  };

  // src/commands/layer.ts
  var LayerManager = class {
    constructor(viewer) {
      this._layers = [];
      this._cesiumRefs = /* @__PURE__ */ new Map();
      this._viewer = viewer;
    }
    get layers() {
      return this._layers;
    }
    getCesiumRefs(layerId) {
      return this._cesiumRefs.get(layerId);
    }
    setCesiumRefs(layerId, refs) {
      this._cesiumRefs.set(layerId, refs);
    }
    // ==================== addGeoJsonLayer ====================
    async addGeoJsonLayer(params) {
      const { id, name, data, url, style, dataRefId } = params;
      if (!data && !url) throw new Error('Either "data" or "url" must be provided');
      const layerId = id ?? `layer_${Date.now()}`;
      const layerName = name ?? layerId;
      const color = style?.color ?? DEFAULT_LAYER_COLOR;
      const opacity = style?.opacity ?? 0.6;
      const pointSize = style?.pointSize ?? 10;
      this.removeLayer(layerId);
      const cesiumColor = parseColor(color).withAlpha(opacity);
      const ds = await Cesium3.GeoJsonDataSource.load(url ?? data, {
        stroke: cesiumColor,
        fill: cesiumColor.withAlpha(opacity * 0.4),
        strokeWidth: 3,
        markerSize: 1,
        markerColor: cesiumColor,
        clampToGround: true
      });
      ds.name = layerName;
      const circleImage = createCircleImage(pointSize * 2, "#FFFFFF", 1);
      const entities = ds.entities.values;
      const styleEntities = [...entities];
      const polygonOutlines = /* @__PURE__ */ new Map();
      const labelField = params.labelField;
      const ls = params.labelStyle;
      const labelFont = ls?.font ?? "12px sans-serif";
      const labelFillColor = ls?.fillColor ? parseColor(ls.fillColor) : Cesium3.Color.WHITE;
      const labelOutlineColor = ls?.outlineColor ? parseColor(ls.outlineColor) : Cesium3.Color.BLACK;
      const labelOutlineWidth = ls?.outlineWidth ?? 2;
      const labelOffset = ls?.pixelOffset ? new Cesium3.Cartesian2(ls.pixelOffset[0], ls.pixelOffset[1]) : new Cesium3.Cartesian2(0, -pointSize - 4);
      for (let i = 0; i < entities.length; i++) {
        const e = entities[i];
        if (e.billboard) {
          e.billboard.image = new Cesium3.ConstantProperty(circleImage);
          e.billboard.color = new Cesium3.ConstantProperty(cesiumColor);
          e.billboard.width = new Cesium3.ConstantProperty(pointSize * 2);
          e.billboard.height = new Cesium3.ConstantProperty(pointSize * 2);
          e.billboard.heightReference = new Cesium3.ConstantProperty(Cesium3.HeightReference.CLAMP_TO_GROUND);
          e.billboard.disableDepthTestDistance = new Cesium3.ConstantProperty(Number.POSITIVE_INFINITY);
        }
        if (labelField && e.properties && e.position) {
          const val = e.properties[labelField]?.getValue(Cesium3.JulianDate.now());
          if (val != null && val !== "") {
            e.label = new Cesium3.LabelGraphics({
              text: String(val),
              font: labelFont,
              fillColor: labelFillColor,
              outlineColor: labelOutlineColor,
              outlineWidth: labelOutlineWidth,
              style: Cesium3.LabelStyle.FILL_AND_OUTLINE,
              pixelOffset: labelOffset,
              scale: ls?.scale ?? 1,
              verticalOrigin: Cesium3.VerticalOrigin.BOTTOM,
              heightReference: Cesium3.HeightReference.CLAMP_TO_GROUND,
              disableDepthTestDistance: Number.POSITIVE_INFINITY
            });
          }
        }
      }
      const strokeWidth = style?.strokeWidth ?? 3;
      for (let i = 0; i < entities.length; i++) {
        const e = entities[i];
        if (e.polygon) {
          const hierarchy = e.polygon.hierarchy?.getValue(Cesium3.JulianDate.now());
          if (hierarchy?.positions) {
            const outlines = [];
            const positions = [...hierarchy.positions, hierarchy.positions[0]];
            const outline = ds.entities.add({
              polyline: {
                positions,
                width: strokeWidth,
                material: cesiumColor,
                clampToGround: true
              }
            });
            outlines.push(outline);
            if (hierarchy.holes) {
              for (const hole of hierarchy.holes) {
                if (hole.positions) {
                  const holeOutline = ds.entities.add({
                    polyline: {
                      positions: [...hole.positions, hole.positions[0]],
                      width: strokeWidth,
                      material: cesiumColor,
                      clampToGround: true
                    }
                  });
                  outlines.push(holeOutline);
                }
              }
            }
            if (outlines.length) polygonOutlines.set(e, outlines);
          }
        }
      }
      const choropleth = style?.choropleth;
      if (choropleth?.field && choropleth?.breaks && choropleth?.colors) {
        applyChoroplethStyle(styleEntities, choropleth.field, choropleth.breaks, choropleth.colors, opacity, polygonOutlines);
      }
      const category = style?.category;
      if (category?.field) {
        applyCategoryStyle(styleEntities, category.field, category.colors, opacity, polygonOutlines);
      }
      if (style?.randomColor) {
        applyRandomColorStyle(styleEntities, opacity, polygonOutlines);
      }
      if (style?.gradient) {
        applyGradientStyle(styleEntities, style.gradient, opacity, polygonOutlines);
      }
      this._viewer.dataSources.add(ds);
      const geomType = data ? detectGeometryType(data) : detectGeometryTypeFromDataSource(ds);
      const info = {
        id: layerId,
        name: layerName,
        type: geomType,
        visible: true,
        color,
        dataRefId
      };
      this._cesiumRefs.set(layerId, { dataSource: ds, styleEntities, polygonOutlines });
      this._layers.push(info);
      this._viewer.flyTo(ds, { duration: 1.5 });
      return info;
    }
    // ==================== addGeoJsonPrimitive ====================
    async addGeoJsonPrimitive(params) {
      const { id, name, data, url, allowPicking, show } = params;
      if (!data && !url) throw new Error('Either "data" or "url" must be provided');
      const layerId = id ?? `geojson_prim_${Date.now()}`;
      const layerName = name ?? layerId;
      this.removeLayer(layerId);
      const opts = {};
      if (allowPicking !== void 0) opts.allowPicking = allowPicking;
      if (show !== void 0) opts.show = show;
      const GeoJsonPrimitive2 = Cesium3.GeoJsonPrimitive;
      if (!GeoJsonPrimitive2) {
        throw new Error("GeoJsonPrimitive is not available in this CesiumJS version");
      }
      let primitive;
      if (url) {
        primitive = await GeoJsonPrimitive2.fromUrl(url, opts);
      } else {
        primitive = GeoJsonPrimitive2.fromGeoJson(data, opts);
      }
      this._viewer.scene.primitives.add(primitive);
      const featureCount = primitive.featureCount ?? 0;
      const info = {
        id: layerId,
        name: layerName,
        type: "geojson-primitive",
        visible: show !== false,
        color: "#10B981"
      };
      this._cesiumRefs.set(layerId, { primitive });
      this._layers.push(info);
      this._viewer.flyTo(primitive, { duration: 1.5 }).catch(() => {
      });
      return { ...info, featureCount };
    }
    // ==================== addHeatmap ====================
    async addHeatmap(params) {
      const {
        id,
        name,
        data,
        radius = 30,
        gradient,
        blur = 0.85,
        maxOpacity = 0.8,
        minOpacity = 0,
        resolution = 512
      } = params;
      const layerId = id ?? `heatmap_${Date.now()}`;
      const layerName = name ?? layerId;
      const features = data?.features ?? [];
      const points = [];
      for (const f of features) {
        const geom = f?.geometry;
        if (geom?.type === "Point") {
          const [lon, lat] = geom.coordinates;
          const w = f.properties?.weight ?? f.properties?.value ?? f.properties?.density ?? 1;
          points.push({ lon, lat, weight: typeof w === "number" ? w : 1 });
        }
      }
      if (!points.length) {
        return this.addGeoJsonLayer({ id: layerId, name: layerName, data, style: { color: "#FF4500", opacity: 0.8 } });
      }
      const lons = points.map((p) => p.lon);
      const lats = points.map((p) => p.lat);
      const lonRange = Math.max(...lons) - Math.min(...lons);
      const latRange = Math.max(...lats) - Math.min(...lats);
      const padLon = lonRange * 0.05 || 0.01;
      const padLat = latRange * 0.05 || 0.01;
      const west = Math.min(...lons) - padLon;
      const south = Math.min(...lats) - padLat;
      const east = Math.max(...lons) + padLon;
      const north = Math.max(...lats) + padLat;
      const canvas = generateHeatmapCanvas(points, radius, { west, south, east, north }, {
        gradient,
        blur,
        maxOpacity,
        minOpacity,
        resolution
      });
      if (!canvas) {
        return this.addGeoJsonLayer({ id: layerId, name: layerName, data, style: { color: "#FF4500", opacity: 0.8 } });
      }
      const entity = this._viewer.entities.add({
        rectangle: {
          coordinates: Cesium3.Rectangle.fromDegrees(west, south, east, north),
          material: new Cesium3.ImageMaterialProperty({
            image: new Cesium3.ConstantProperty(canvas),
            transparent: true
          }),
          classificationType: Cesium3.ClassificationType.BOTH
        }
      });
      const info = {
        id: layerId,
        name: layerName,
        type: "\u70ED\u529B\u56FE",
        visible: true,
        color: "#FF4500"
      };
      this._cesiumRefs.set(layerId, { entity });
      this._layers.push(info);
      this._viewer.camera.flyTo({
        destination: Cesium3.Rectangle.fromDegrees(west, south, east, north),
        duration: 1.5
      });
      return info;
    }
    // ==================== 基础图层操作 ====================
    removeLayer(id) {
      const idx = this._layers.findIndex((l) => l.id === id);
      if (idx === -1) return;
      const refs = this._cesiumRefs.get(id);
      if (refs) {
        if (refs.dataSource) this._viewer.dataSources.remove(refs.dataSource, true);
        if (refs.entity) this._viewer.entities.remove(refs.entity);
        if (refs.labelEntities) {
          for (const e of refs.labelEntities) this._viewer.entities.remove(e);
        }
        if (refs.tileset) this._viewer.scene.primitives.remove(refs.tileset);
        if (refs.primitive) this._viewer.scene.primitives.remove(refs.primitive);
        if (refs.imageryLayer) this._viewer.imageryLayers.remove(refs.imageryLayer);
        if (refs.movingEntity) this._viewer.entities.remove(refs.movingEntity);
        if (refs.trailEntity) this._viewer.entities.remove(refs.trailEntity);
        this._cesiumRefs.delete(id);
      }
      this._layers.splice(idx, 1);
    }
    /** 根据 Cesium Entity 引用反查并移除对应图层记录（不再删除 entity 本身） */
    untrackByEntity(entity) {
      for (const [layerId, refs] of this._cesiumRefs) {
        if (refs.entity === entity) {
          const idx = this._layers.findIndex((l) => l.id === layerId);
          if (idx !== -1) this._layers.splice(idx, 1);
          this._cesiumRefs.delete(layerId);
          return layerId;
        }
      }
      return void 0;
    }
    setLayerVisibility(id, visible) {
      const layer = this._layers.find((l) => l.id === id);
      if (!layer) return;
      layer.visible = visible;
      const refs = this._cesiumRefs.get(id);
      if (!refs) return;
      if (refs.dataSource) refs.dataSource.show = visible;
      if (refs.entity) refs.entity.show = visible;
      if (refs.labelEntities) {
        for (const e of refs.labelEntities) e.show = visible;
      }
      if (refs.tileset) refs.tileset.show = visible;
      if (refs.primitive) refs.primitive.show = visible;
      if (refs.imageryLayer) refs.imageryLayer.show = visible;
      if (refs.movingEntity) refs.movingEntity.show = visible;
      if (refs.trailEntity) refs.trailEntity.show = visible;
    }
    toggleLayer(id) {
      const layer = this._layers.find((l) => l.id === id);
      if (layer) {
        this.setLayerVisibility(id, !layer.visible);
      }
    }
    zoomToLayer(id) {
      const refs = this._cesiumRefs.get(id);
      if (!refs) return;
      if (refs.dataSource) {
        this._viewer.flyTo(refs.dataSource);
        return;
      }
      if (refs.labelEntities?.length) {
        this._viewer.flyTo(refs.labelEntities);
        return;
      }
      if (refs.entity) {
        this._viewer.flyTo(refs.entity);
        return;
      }
      if (refs.tileset) {
        this._viewer.flyTo(refs.tileset);
        return;
      }
      if (refs.primitive) {
        this._viewer.flyTo(refs.primitive);
        return;
      }
      if (refs.movingEntity) {
        this._viewer.flyTo(refs.movingEntity);
        return;
      }
    }
    updateLayerStyle(params) {
      const layer = this._layers.find((l) => l.id === params.layerId);
      if (!layer) return false;
      const refs = this._cesiumRefs.get(params.layerId);
      const ls = params.labelStyle;
      if (ls && refs?.labelEntities) {
        const entities = refs.labelEntities;
        for (const entity of entities) {
          if (!entity.label) continue;
          if (ls.font || ls.fontSize) {
            const fontSize = ls.fontSize ?? 14;
            entity.label.font = new Cesium3.ConstantProperty(ls.font ?? `${fontSize}px sans-serif`);
          }
          if (ls.fillColor) {
            entity.label.fillColor = new Cesium3.ConstantProperty(
              parseColor(ls.fillColor)
            );
          }
          if (ls.outlineColor) {
            entity.label.outlineColor = new Cesium3.ConstantProperty(
              parseColor(ls.outlineColor)
            );
          }
          if (ls.outlineWidth !== void 0) {
            entity.label.outlineWidth = new Cesium3.ConstantProperty(ls.outlineWidth);
          }
          if (ls.scale !== void 0) {
            entity.label.scale = new Cesium3.ConstantProperty(ls.scale);
          }
          if (ls.showBackground !== void 0) {
            entity.label.showBackground = new Cesium3.ConstantProperty(ls.showBackground);
          }
          if (ls.backgroundColor) {
            entity.label.backgroundColor = new Cesium3.ConstantProperty(
              parseColor(ls.backgroundColor)
            );
          }
          if (ls.pixelOffset) {
            entity.label.pixelOffset = new Cesium3.ConstantProperty(
              new Cesium3.Cartesian2(ls.pixelOffset[0], ls.pixelOffset[1])
            );
          }
        }
        if (ls.fillColor) layer.color = ls.fillColor;
        return true;
      }
      const gs = params.layerStyle;
      if (gs && refs?.dataSource) {
        const ds = refs.dataSource;
        if (!isValidLayerStyleForUpdate(gs)) return false;
        if (hasThematicStyle(gs) && !refs.styleEntities) return false;
        applyBasicLayerStyle(ds.entities.values, gs, layer.color, refs.polygonOutlines);
        applyThematicLayerStyle(gs, refs.styleEntities ?? ds.entities.values, refs.polygonOutlines);
        if (gs.color) layer.color = gs.color;
        return true;
      }
      const imageryStyle = params.imageryStyle;
      if (imageryStyle && refs?.imageryLayer) {
        if (!isValidImageryLayerStyle(imageryStyle)) return false;
        applyImageryLayerStyle(refs.imageryLayer, imageryStyle);
        this._viewer.scene.requestRender?.();
        return true;
      }
      const primitiveStyle = params.primitiveStyle;
      if (primitiveStyle && refs?.primitive) {
        if (!isValidPrimitiveLayerStyle(primitiveStyle)) return false;
        applyGeoJsonPrimitiveStyle(refs.primitive, primitiveStyle);
        this._viewer.scene.requestRender?.();
        if (primitiveStyle.color) layer.color = primitiveStyle.color;
        return true;
      }
      const ts = params.tileStyle;
      if (ts && refs?.tileset) {
        const styleObj = {};
        if (ts.color) styleObj.color = ts.color;
        if (ts.show) styleObj.show = ts.show;
        if (ts.pointSize) styleObj.pointSize = ts.pointSize;
        if (ts.meta) Object.assign(styleObj, { meta: ts.meta });
        refs.tileset.style = new Cesium3.Cesium3DTileStyle(styleObj);
        if (ts.color) layer.color = ts.color;
        return true;
      }
      return false;
    }
    listLayers() {
      return this._layers.map(({ id, name, type, visible, color, dataRefId }) => ({ id, name, type, visible, color, dataRefId }));
    }
    getLayerSchema(params) {
      const layer = this._layers.find((l) => l.id === params.layerId);
      if (!layer) throw new Error(`Layer not found: ${params.layerId}`);
      const refs = this._cesiumRefs.get(params.layerId);
      if (refs?.tileset) {
        return this._getTilesetSchema(params.layerId, layer.name, refs.tileset);
      }
      const ds = refs?.dataSource;
      if (!ds) throw new Error(`Layer '${params.layerId}' has no DataSource or Tileset`);
      const entities = ds.entities.values;
      const fieldMap = /* @__PURE__ */ new Map();
      for (const e of entities) {
        if (!e.properties) continue;
        for (const name of e.properties.propertyNames) {
          if (fieldMap.has(name)) continue;
          const val = e.properties[name]?.getValue?.(Cesium3.JulianDate.now());
          fieldMap.set(name, {
            name,
            type: val === null || val === void 0 ? "unknown" : Array.isArray(val) ? "array" : typeof val,
            sample: val
          });
        }
        if (fieldMap.size > 0) break;
      }
      return {
        layerId: params.layerId,
        layerName: layer.name,
        entityCount: entities.length,
        fields: Array.from(fieldMap.values())
      };
    }
    _getTilesetSchema(layerId, layerName, tileset) {
      const fieldMap = /* @__PURE__ */ new Map();
      const props = tileset.properties;
      if (props && typeof props === "object") {
        for (const key of Object.keys(props)) {
          const meta = props[key];
          fieldMap.set(key, {
            name: key,
            type: meta?.type ?? (meta?.minimum !== void 0 ? "number" : "unknown"),
            sample: meta?.minimum ?? meta?.maximum ?? void 0
          });
        }
      }
      const root = tileset.root;
      if (root?.content && typeof root.content.featuresLength === "number" && root.content.featuresLength > 0) {
        const feature = root.content.getFeature(0);
        if (feature && typeof feature.getPropertyIds === "function") {
          const ids = feature.getPropertyIds();
          for (const id of ids) {
            if (fieldMap.has(id)) continue;
            const val = feature.getProperty(id);
            fieldMap.set(id, {
              name: id,
              type: val === null || val === void 0 ? "unknown" : Array.isArray(val) ? "array" : typeof val,
              sample: val
            });
          }
        }
      }
      const metadata = {};
      const asset = tileset.asset;
      if (asset && typeof asset === "object") {
        if (asset.version) metadata.assetVersion = String(asset.version);
        if (asset.tilesetVersion) metadata.tilesetVersion = String(asset.tilesetVersion);
      }
      const resource = tileset.resource ?? tileset._resource;
      if (resource?.ionAssetId) metadata.ionAssetId = resource.ionAssetId;
      if (tileset.maximumScreenSpaceError != null) metadata.geometricError = tileset.maximumScreenSpaceError;
      if (tileset.boundingSphere) {
        try {
          const center = Cesium3.Cartographic.fromCartesian(tileset.boundingSphere.center);
          metadata.boundingSphere = {
            longitude: Cesium3.Math.toDegrees(center.longitude),
            latitude: Cesium3.Math.toDegrees(center.latitude),
            height: center.height,
            radius: tileset.boundingSphere.radius
          };
        } catch {
        }
      }
      const extras = tileset.extras;
      if (extras && typeof extras === "object" && Object.keys(extras).length > 0) {
        metadata.extras = extras;
      }
      return {
        layerId,
        layerName,
        entityCount: -1,
        // 3D Tiles 不提供精确实体数
        fields: Array.from(fieldMap.values()),
        metadata: Object.keys(metadata).length > 0 ? metadata : void 0
      };
    }
    clearAll() {
      const removedLayers = this._layers.length;
      const ids = this._layers.map((l) => l.id);
      for (const id of ids) {
        this.removeLayer(id);
      }
      const removedEntities = this._viewer.entities.values.length;
      this._viewer.entities.removeAll();
      this._viewer.dataSources.removeAll(true);
      return { removedLayers, removedEntities };
    }
    /** 更新图层列表引用（供外部响应式框架使用） */
    setLayersRef(layers) {
      this._layers = layers;
    }
    // ==================== 3D Scene ====================
    async load3dTiles(params) {
      const { id, name, url, ionAssetId, maximumScreenSpaceError = 16, heightOffset = 0 } = params;
      const layerId = id ?? `3dtiles_${Date.now()}`;
      const layerName = name ?? "3D Tiles";
      if (!url && !ionAssetId) throw new Error('Either "url" or "ionAssetId" must be provided');
      this.removeLayer(layerId);
      const tileset = ionAssetId ? await Cesium3.Cesium3DTileset.fromIonAssetId(ionAssetId, { maximumScreenSpaceError }) : await Cesium3.Cesium3DTileset.fromUrl(url, { maximumScreenSpaceError });
      if (heightOffset !== 0) {
        const cartographic = Cesium3.Cartographic.fromCartesian(tileset.boundingSphere.center);
        const surface = Cesium3.Cartesian3.fromRadians(
          cartographic.longitude,
          cartographic.latitude,
          0
        );
        const offset = Cesium3.Cartesian3.fromRadians(
          cartographic.longitude,
          cartographic.latitude,
          heightOffset
        );
        const translation = Cesium3.Cartesian3.subtract(offset, surface, new Cesium3.Cartesian3());
        tileset.modelMatrix = Cesium3.Matrix4.fromTranslation(translation);
      }
      this._viewer.scene.primitives.add(tileset);
      this._viewer.flyTo(tileset, { duration: 1.5 });
      const info = {
        id: layerId,
        name: layerName,
        type: "3D Tiles",
        visible: true,
        color: "#8B5CF6"
      };
      this._cesiumRefs.set(layerId, { tileset });
      this._layers.push(info);
      return info;
    }
    // ==================== addGaussianSplat ====================
    async addGaussianSplat(params) {
      const { id, name, url, maximumScreenSpaceError = 16, show = true } = params;
      const layerId = id ?? `gaussian_splat_${Date.now()}`;
      const layerName = name ?? "3D Gaussian Splat";
      this.removeLayer(layerId);
      const tileset = await Cesium3.Cesium3DTileset.fromUrl(url, {
        maximumScreenSpaceError
      });
      tileset.show = show;
      this._viewer.scene.primitives.add(tileset);
      this._viewer.flyTo(tileset, { duration: 1.5 });
      const info = {
        id: layerId,
        name: layerName,
        type: "3d-gaussian-splat",
        visible: show,
        color: "#10B981"
      };
      this._cesiumRefs.set(layerId, { tileset });
      this._layers.push(info);
      return info;
    }
    loadTerrain(params) {
      const { provider, url, cesiumIonAssetId } = params;
      const onError = (e) => console.error("[CesiumBridge] loadTerrain failed:", e);
      if (provider === "flat") {
        this._viewer.scene.terrainProvider = new Cesium3.EllipsoidTerrainProvider();
      } else if (provider === "arcgis") {
        Cesium3.ArcGISTiledElevationTerrainProvider.fromUrl(
          "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer"
        ).then((tp) => {
          this._viewer.scene.terrainProvider = tp;
        }).catch(onError);
      } else if (provider === "cesiumion" && cesiumIonAssetId) {
        Cesium3.CesiumTerrainProvider.fromIonAssetId(cesiumIonAssetId).then((tp) => {
          this._viewer.scene.terrainProvider = tp;
        }).catch(onError);
      } else if (url) {
        Cesium3.CesiumTerrainProvider.fromUrl(url).then((tp) => {
          this._viewer.scene.terrainProvider = tp;
        }).catch(onError);
      }
    }
    async loadImageryService(params) {
      const { id, name, url, ionAssetId, serviceType, layerName, opacity = 1 } = params;
      const layerId = id ?? `imagery_${Date.now()}`;
      if (!url && !ionAssetId) throw new Error('Either "url" or "ionAssetId" must be provided');
      let imageryLayer;
      if (ionAssetId) {
        const provider = await Cesium3.IonImageryProvider.fromAssetId(ionAssetId);
        imageryLayer = this._viewer.imageryLayers.addImageryProvider(provider);
      } else {
        let provider;
        switch (serviceType) {
          case "wms":
            provider = new Cesium3.WebMapServiceImageryProvider({
              url,
              layers: layerName ?? ""
            });
            break;
          case "wmts":
            provider = new Cesium3.WebMapTileServiceImageryProvider({
              url,
              layer: layerName ?? "",
              style: "default",
              tileMatrixSetID: "default028mm"
            });
            break;
          case "arcgis_mapserver":
            provider = new Cesium3.ArcGisMapServerImageryProvider({ url });
            break;
          case "xyz":
          default:
            provider = new Cesium3.UrlTemplateImageryProvider({
              url,
              maximumLevel: 18
            });
            break;
        }
        imageryLayer = this._viewer.imageryLayers.addImageryProvider(provider);
      }
      imageryLayer.alpha = opacity;
      const layerName_ = name ?? (ionAssetId ? `Ion \u5F71\u50CF (${ionAssetId})` : `\u5F71\u50CF (${serviceType})`);
      const info = {
        id: layerId,
        name: layerName_,
        type: "\u5F71\u50CF",
        visible: true,
        color: "#06B6D4"
      };
      this._cesiumRefs.set(layerId, { imageryLayer });
      this._layers.push(info);
      return info;
    }
    // ==================== CZML DataSource ====================
    async loadCzml(params) {
      const { id, name, data, url, sourceUri, clampToGround } = params;
      if (!data && !url) throw new Error('Either "data" or "url" must be provided');
      const layerId = id ?? `czml_${Date.now()}`;
      this.removeLayer(layerId);
      const loadOptions = {};
      if (sourceUri) loadOptions.sourceUri = sourceUri;
      const ds = await Cesium3.CzmlDataSource.load(url ?? data, loadOptions);
      const displayName = name || ds.name || (url ? `CZML (${url.split("/").pop()})` : "CZML Data");
      if (clampToGround) {
        for (const entity of ds.entities.values) {
          if (entity.billboard) {
            entity.billboard.heightReference = new Cesium3.ConstantProperty(Cesium3.HeightReference.CLAMP_TO_GROUND);
          }
          if (entity.point) {
            entity.point.heightReference = new Cesium3.ConstantProperty(Cesium3.HeightReference.CLAMP_TO_GROUND);
          }
          if (entity.label) {
            entity.label.heightReference = new Cesium3.ConstantProperty(Cesium3.HeightReference.CLAMP_TO_GROUND);
          }
          if (entity.model) {
            entity.model.heightReference = new Cesium3.ConstantProperty(Cesium3.HeightReference.CLAMP_TO_GROUND);
          }
        }
      }
      this._viewer.dataSources.add(ds);
      if (params.flyTo !== false) {
        this._viewer.flyTo(ds, { duration: 1.5 });
      }
      const info = {
        id: layerId,
        name: displayName,
        type: "CZML",
        visible: true,
        color: "#8B5CF6"
      };
      this._cesiumRefs.set(layerId, { dataSource: ds });
      this._layers.push(info);
      return info;
    }
    // ==================== KML/KMZ DataSource ====================
    async loadKml(params) {
      const { id, name, url, data, sourceUri, clampToGround } = params;
      if (!url && !data) throw new Error('Either "url" or "data" must be provided');
      const layerId = id ?? `kml_${Date.now()}`;
      this.removeLayer(layerId);
      const loadOptions = {
        camera: this._viewer.scene.camera,
        canvas: this._viewer.scene.canvas
      };
      if (sourceUri) loadOptions.sourceUri = sourceUri;
      if (clampToGround) loadOptions.clampToGround = true;
      const source = url ?? new Blob([data], { type: "application/xml" });
      const ds = await Cesium3.KmlDataSource.load(source, loadOptions);
      const displayName = name || ds.name || (url ? `KML (${url.split("/").pop()})` : "KML Data");
      this._viewer.dataSources.add(ds);
      if (params.flyTo !== false) {
        this._viewer.flyTo(ds, { duration: 1.5 });
      }
      const info = {
        id: layerId,
        name: displayName,
        type: "KML",
        visible: true,
        color: "#F59E0B"
      };
      this._cesiumRefs.set(layerId, { dataSource: ds });
      this._layers.push(info);
      return info;
    }
    // ==================== Basemap ====================
    setBasemap(params) {
      const basemap = params.basemap ?? "dark";
      this._viewer.imageryLayers.removeAll();
      if (params.url) {
        this._viewer.imageryLayers.addImageryProvider(
          new Cesium3.UrlTemplateImageryProvider({ url: params.url, maximumLevel: 18 })
        );
        return params.url;
      }
      const tk = params.token ?? "";
      const preset = BASEMAP_PRESETS[basemap] ?? BASEMAP_PRESETS["dark"];
      for (const layer of preset.layers(tk)) {
        this._viewer.imageryLayers.addImageryProvider(
          new Cesium3.UrlTemplateImageryProvider(layer)
        );
      }
      if (preset.backgroundColor) {
        this._viewer.scene.backgroundColor = parseColor(preset.backgroundColor);
        this._viewer.scene.globe.baseColor = parseColor(preset.backgroundColor);
      }
      return basemap;
    }
  };
  var DEFAULT_LAYER_COLOR = "#3B82F6";
  var POLYGON_FILL_ALPHA_RATIO = 0.4;
  var IMAGERY_LAYER_STYLE_KEYS = [
    "alpha",
    "brightness",
    "contrast",
    "hue",
    "saturation",
    "gamma"
  ];
  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }
  function isInRange(value, min, max) {
    return value >= min && value <= max;
  }
  function countThematicStyles(style) {
    return [
      style.choropleth !== void 0,
      style.category !== void 0,
      style.randomColor === true,
      style.gradient !== void 0
    ].filter(Boolean).length;
  }
  function hasThematicStyle(style) {
    return countThematicStyles(style) > 0;
  }
  function isValidLayerStyleForUpdate(style) {
    if (countThematicStyles(style) > 1) return false;
    if (style.opacity !== void 0 && (!isFiniteNumber(style.opacity) || !isInRange(style.opacity, 0, 1))) return false;
    if (style.pointSize !== void 0 && (!isFiniteNumber(style.pointSize) || style.pointSize < 0)) return false;
    if (style.strokeWidth !== void 0 && (!isFiniteNumber(style.strokeWidth) || style.strokeWidth < 0)) return false;
    if (style.gradient !== void 0 && style.gradient.length !== 2) return false;
    if (style.category !== void 0 && !style.category.field) return false;
    const choropleth = style.choropleth;
    if (choropleth) {
      if (!choropleth.field || choropleth.breaks.length < 2) return false;
      if (choropleth.colors.length !== choropleth.breaks.length - 1) return false;
      for (let i = 0; i < choropleth.breaks.length; i++) {
        const current = choropleth.breaks[i];
        if (!isFiniteNumber(current)) return false;
        if (i > 0 && current <= choropleth.breaks[i - 1]) return false;
      }
    }
    return true;
  }
  function applyBasicLayerStyle(entities, style, fallbackColor, polygonOutlines) {
    const shouldUpdateColor = style.color !== void 0 || style.opacity !== void 0;
    const baseColor = shouldUpdateColor ? parseColor(style.color ?? fallbackColor) : void 0;
    const alpha = style.opacity ?? baseColor?.alpha;
    const fillColor = baseColor && alpha !== void 0 ? baseColor.withAlpha(alpha) : void 0;
    const polygonFillColor = fillColor ? baseColor.withAlpha(alpha * POLYGON_FILL_ALPHA_RATIO) : void 0;
    const lineMaterial = fillColor ? new Cesium3.ColorMaterialProperty(fillColor) : void 0;
    const fillMaterial = polygonFillColor ? new Cesium3.ColorMaterialProperty(polygonFillColor) : void 0;
    const fillColorProp = fillColor ? new Cesium3.ConstantProperty(fillColor) : void 0;
    const strokeWidthProp = style.strokeWidth !== void 0 ? new Cesium3.ConstantProperty(style.strokeWidth) : void 0;
    const billboardSizeProp = style.pointSize !== void 0 ? new Cesium3.ConstantProperty(style.pointSize * 2) : void 0;
    const pointSizeProp = style.pointSize !== void 0 ? new Cesium3.ConstantProperty(style.pointSize) : void 0;
    for (const entity of entities) {
      if (entity.polyline) {
        if (lineMaterial) entity.polyline.material = lineMaterial;
        if (strokeWidthProp) entity.polyline.width = strokeWidthProp;
      }
      if (entity.polygon) {
        if (fillMaterial && fillColorProp) {
          entity.polygon.material = fillMaterial;
          entity.polygon.outlineColor = fillColorProp;
        }
        syncPolygonOutlines(entity, fillColor, style.strokeWidth, polygonOutlines);
      }
      if (entity.billboard) {
        if (fillColorProp) entity.billboard.color = fillColorProp;
        if (billboardSizeProp) {
          entity.billboard.width = billboardSizeProp;
          entity.billboard.height = billboardSizeProp;
        }
      }
      if (entity.point) {
        if (fillColorProp) entity.point.color = fillColorProp;
        if (pointSizeProp) entity.point.pixelSize = pointSizeProp;
      }
    }
  }
  function applyThematicLayerStyle(style, entities, polygonOutlines) {
    const opacity = style.opacity ?? 0.6;
    const choropleth = style.choropleth;
    if (choropleth) {
      applyChoroplethStyle(entities, choropleth.field, choropleth.breaks, choropleth.colors, opacity, polygonOutlines);
      return;
    }
    const category = style.category;
    if (category) {
      applyCategoryStyle(entities, category.field, category.colors, opacity, polygonOutlines);
      return;
    }
    if (style.randomColor) {
      applyRandomColorStyle(entities, opacity, polygonOutlines);
      return;
    }
    if (style.gradient) {
      applyGradientStyle(entities, style.gradient, opacity, polygonOutlines);
    }
  }
  function isValidImageryLayerStyle(style) {
    const hasField = IMAGERY_LAYER_STYLE_KEYS.some((key) => style[key] !== void 0);
    if (!hasField) return false;
    for (const key of IMAGERY_LAYER_STYLE_KEYS) {
      const value = style[key];
      if (value === void 0) continue;
      if (!isFiniteNumber(value)) return false;
      if (key === "alpha" && !isInRange(value, 0, 1)) return false;
    }
    return true;
  }
  function applyImageryLayerStyle(layer, style) {
    for (const key of IMAGERY_LAYER_STYLE_KEYS) {
      const value = style[key];
      if (value !== void 0) {
        layer[key] = value;
      }
    }
  }
  function isValidPrimitiveLayerStyle(style) {
    const hasField = [
      style.color,
      style.opacity,
      style.outlineColor,
      style.outlineWidth,
      style.pointSize,
      style.lineWidth
    ].some((value) => value !== void 0);
    if (!hasField) return false;
    if (style.opacity !== void 0 && (!isFiniteNumber(style.opacity) || !isInRange(style.opacity, 0, 1))) return false;
    if (style.outlineWidth !== void 0 && (!isFiniteNumber(style.outlineWidth) || !isInRange(style.outlineWidth, 0, 255))) return false;
    if (style.pointSize !== void 0 && (!isFiniteNumber(style.pointSize) || !isInRange(style.pointSize, 0, 255))) return false;
    if (style.lineWidth !== void 0 && (!isFiniteNumber(style.lineWidth) || !isInRange(style.lineWidth, 0, 255))) return false;
    return true;
  }
  function applyGeoJsonPrimitiveStyle(primitive, style) {
    const C = Cesium3;
    if (primitive.points && C.BufferPoint && C.BufferPointMaterial) {
      applyPrimitiveCollectionStyle(
        primitive.points,
        new C.BufferPoint(),
        new C.BufferPointMaterial(),
        style,
        "point"
      );
    }
    if (primitive.polylines && C.BufferPolyline && C.BufferPolylineMaterial) {
      applyPrimitiveCollectionStyle(
        primitive.polylines,
        new C.BufferPolyline(),
        new C.BufferPolylineMaterial(),
        style,
        "polyline"
      );
    }
    if (primitive.polygons && C.BufferPolygon && C.BufferPolygonMaterial) {
      applyPrimitiveCollectionStyle(
        primitive.polygons,
        new C.BufferPolygon(),
        new C.BufferPolygonMaterial(),
        style,
        "polygon"
      );
    }
  }
  function applyPrimitiveCollectionStyle(collection, element, material, style, target) {
    const color = style.color ? parseColor(style.color) : void 0;
    const outlineColor = style.outlineColor ? parseColor(style.outlineColor) : void 0;
    const count = collection.primitiveCount ?? 0;
    for (let i = 0; i < count; i++) {
      collection.get(i, element);
      element.getMaterial(material);
      if (color) {
        material.color = color.withAlpha(style.opacity ?? color.alpha);
      } else if (style.opacity !== void 0 && material.color) {
        material.color = material.color.withAlpha(style.opacity);
      }
      if (outlineColor) material.outlineColor = outlineColor;
      if (style.outlineWidth !== void 0) material.outlineWidth = style.outlineWidth;
      if (target === "point" && style.pointSize !== void 0) material.size = style.pointSize;
      if (target === "polyline" && style.lineWidth !== void 0) material.width = style.lineWidth;
      element.setMaterial(material);
    }
  }
  function applyChoroplethStyle(entities, field, breaks, colors, opacity, polygonOutlines) {
    const fillColors = colors.map((c) => parseColor(c ?? DEFAULT_LAYER_COLOR).withAlpha(opacity));
    const strokeColor = parseColor("#333333").withAlpha(0.6);
    for (const entity of entities) {
      const props = entity.properties;
      if (!props) continue;
      const raw = props[field]?.getValue(Cesium3.JulianDate.now());
      const val = typeof raw === "number" ? raw : parseFloat(raw);
      if (isNaN(val)) continue;
      let classIdx = colors.length - 1;
      for (let i = 1; i < breaks.length; i++) {
        if (val <= breaks[i]) {
          classIdx = Math.min(i - 1, colors.length - 1);
          break;
        }
      }
      applyColorToEntity(entity, fillColors[classIdx], strokeColor, polygonOutlines);
    }
  }
  var CATEGORY_PALETTE = [
    "#3B82F6",
    "#EF4444",
    "#10B981",
    "#F59E0B",
    "#8B5CF6",
    "#EC4899",
    "#06B6D4",
    "#F97316",
    "#6366F1",
    "#14B8A6",
    "#E11D48",
    "#84CC16"
  ];
  function getCategoryIndex(raw, categoryIndexes) {
    if (raw === void 0 || raw === null) return -1;
    if (typeof raw === "number" && Number.isFinite(raw)) return Math.trunc(raw);
    const text = String(raw).trim();
    if (!text) return -1;
    const numeric = Number(text);
    if (Number.isFinite(numeric)) return Math.trunc(numeric);
    if (!categoryIndexes.has(text)) {
      categoryIndexes.set(text, categoryIndexes.size);
    }
    return categoryIndexes.get(text);
  }
  function applyCategoryStyle(entities, field, customColors, opacity, polygonOutlines) {
    const palette = customColors?.length ? customColors : CATEGORY_PALETTE;
    const fillColors = palette.map((c) => parseColor(c).withAlpha(opacity));
    const strokeColors = palette.map((c) => parseColor(c).withAlpha(Math.min(opacity + 0.2, 1)));
    const noiseFill = parseColor("#6B7280").withAlpha(opacity);
    const noiseStroke = parseColor("#6B7280").withAlpha(Math.min(opacity + 0.2, 1));
    const categoryIndexes = /* @__PURE__ */ new Map();
    for (const entity of entities) {
      const props = entity.properties;
      if (!props) continue;
      const raw = props[field]?.getValue(Cesium3.JulianDate.now());
      const val = getCategoryIndex(raw, categoryIndexes);
      const idx = val < 0 ? -1 : val % palette.length;
      const fillColor = idx < 0 ? noiseFill : fillColors[idx];
      const strokeColor = idx < 0 ? noiseStroke : strokeColors[idx];
      applyColorToEntity(entity, fillColor, strokeColor, polygonOutlines);
    }
  }
  function applyRandomColorStyle(entities, opacity, polygonOutlines) {
    for (const entity of entities) {
      const hue = Math.random();
      const sat = 0.5 + Math.random() * 0.4;
      const light = 0.4 + Math.random() * 0.25;
      const fillColor = Cesium3.Color.fromHsl(hue, sat, light, opacity);
      const strokeColor = Cesium3.Color.fromHsl(hue, sat, light, Math.min(opacity + 0.3, 1));
      applyColorToEntity(entity, fillColor, strokeColor, polygonOutlines);
    }
  }
  function applyGradientStyle(entities, gradient, opacity, polygonOutlines) {
    const startColor = parseColor(gradient[0]);
    const endColor = parseColor(gradient[1]);
    const total = Math.max(entities.length - 1, 1);
    for (let i = 0; i < entities.length; i++) {
      const t = i / total;
      const r = startColor.red + (endColor.red - startColor.red) * t;
      const g = startColor.green + (endColor.green - startColor.green) * t;
      const b = startColor.blue + (endColor.blue - startColor.blue) * t;
      const fillColor = new Cesium3.Color(r, g, b, opacity);
      const strokeColor = new Cesium3.Color(r, g, b, Math.min(opacity + 0.3, 1));
      applyColorToEntity(entities[i], fillColor, strokeColor, polygonOutlines);
    }
  }
  function applyColorToEntity(entity, fillColor, strokeColor, polygonOutlines) {
    if (entity.polygon) {
      entity.polygon.material = new Cesium3.ColorMaterialProperty(fillColor);
      entity.polygon.outlineColor = new Cesium3.ConstantProperty(strokeColor);
      syncPolygonOutlines(entity, strokeColor, void 0, polygonOutlines);
    } else if (entity.polyline) {
      entity.polyline.material = new Cesium3.ColorMaterialProperty(fillColor);
    } else if (entity.point) {
      entity.point.color = new Cesium3.ConstantProperty(fillColor);
    } else if (entity.billboard) {
      entity.billboard.color = new Cesium3.ConstantProperty(fillColor);
    }
  }
  function syncPolygonOutlines(entity, strokeColor, strokeWidth, polygonOutlines) {
    const outlines = polygonOutlines?.get(entity);
    if (!outlines) return;
    for (const outline of outlines) {
      if (!outline.polyline) continue;
      if (strokeColor) outline.polyline.material = new Cesium3.ColorMaterialProperty(strokeColor);
      if (strokeWidth !== void 0) outline.polyline.width = new Cesium3.ConstantProperty(strokeWidth);
    }
  }
  function detectGeometryType(geojson) {
    const features = geojson?.features;
    if (!features?.length) return "\u672A\u77E5";
    const t = features[0]?.geometry?.type ?? "";
    if (t.includes("Point")) return "\u70B9";
    if (t.includes("Line")) return "\u7EBF";
    if (t.includes("Polygon")) return "\u9762";
    return t || "\u672A\u77E5";
  }
  function detectGeometryTypeFromDataSource(ds) {
    const entities = ds.entities.values;
    if (!entities.length) return "\u672A\u77E5";
    const e = entities[0];
    if (e.point || e.billboard) return "\u70B9";
    if (e.polyline) return "\u7EBF";
    if (e.polygon) return "\u9762";
    return "\u672A\u77E5";
  }
  function createCircleImage(size, cssColor, alpha) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const px = Math.round(size * dpr);
    const canvas = document.createElement("canvas");
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext("2d");
    const r = px / 2;
    ctx.beginPath();
    ctx.arc(r, r, r - 2 * dpr, 0, Math.PI * 2);
    const c = parseColor(cssColor).withAlpha(alpha);
    ctx.fillStyle = `rgba(${Math.round(c.red * 255)},${Math.round(c.green * 255)},${Math.round(c.blue * 255)},${c.alpha})`;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 1.5 * dpr;
    ctx.stroke();
    return canvas;
  }
  function generateHeatmapCanvas(points, radius, bounds, opts = {}) {
    if (!points.length) return null;
    const SIZE = opts.resolution ?? 512;
    const { west, south, east, north } = bounds;
    const w = east - west;
    const h = north - south;
    const container = document.createElement("div");
    container.style.cssText = `width:${SIZE}px;height:${SIZE}px;position:fixed;left:-9999px;top:-9999px;`;
    document.body.appendChild(container);
    try {
      const heatmapInstance = import_heatmap.default.create({
        container,
        radius: Math.max(radius, 10),
        maxOpacity: opts.maxOpacity ?? 0.8,
        minOpacity: opts.minOpacity ?? 0,
        blur: opts.blur ?? 0.85,
        gradient: opts.gradient ?? { 0.25: "rgb(0,0,255)", 0.55: "rgb(0,255,0)", 0.85: "yellow", 1: "rgb(255,0,0)" }
      });
      const maxW = Math.max(...points.map((p) => p.weight));
      const data = points.map((p) => ({
        x: Math.round((p.lon - west) / w * SIZE),
        y: Math.round((north - p.lat) / h * SIZE),
        value: p.weight
      }));
      heatmapInstance.setData({ max: maxW || 1, data });
      const heatCanvas = container.querySelector("canvas");
      if (!heatCanvas) return null;
      const result = document.createElement("canvas");
      result.width = SIZE;
      result.height = SIZE;
      const ctx = result.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(heatCanvas, 0, 0);
      return result;
    } finally {
      document.body.removeChild(container);
    }
  }

  // src/commands/entity.ts
  var Cesium4 = __toESM(require_cesium());
  function addLabels(viewer, data, params) {
    const { field, style } = params;
    const features = data?.features ?? [];
    const entities = [];
    const font = style?.font ?? "14px sans-serif";
    const fillColor = style?.fillColor ? parseColor(style.fillColor) : Cesium4.Color.WHITE;
    const outlineColor = style?.outlineColor ? parseColor(style.outlineColor) : Cesium4.Color.BLACK;
    const outlineWidth = style?.outlineWidth ?? 2;
    const showBackground = style?.showBackground ?? false;
    const backgroundColor = style?.backgroundColor ? parseColor(style.backgroundColor) : new Cesium4.Color(0.1, 0.1, 0.1, 0.7);
    const pixelOffset = style?.pixelOffset ? new Cesium4.Cartesian2(style.pixelOffset[0], style.pixelOffset[1]) : new Cesium4.Cartesian2(0, -12);
    const scale = style?.scale ?? 1;
    for (const feature of features) {
      const props = feature?.properties ?? {};
      const text = props[field];
      if (text == null || text === "") continue;
      const center = computeFeatureCentroid(feature);
      if (!center) continue;
      const entity = viewer.entities.add({
        position: Cesium4.Cartesian3.fromDegrees(center[0], center[1]),
        label: {
          text: String(text),
          font,
          fillColor,
          outlineColor,
          outlineWidth,
          style: Cesium4.LabelStyle.FILL_AND_OUTLINE,
          showBackground,
          backgroundColor,
          pixelOffset,
          scale,
          verticalOrigin: Cesium4.VerticalOrigin.BOTTOM,
          heightReference: Cesium4.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      });
      entities.push(entity);
    }
    return entities;
  }
  function addMarker(viewer, params) {
    const { longitude, latitude, label, color = "#3B82F6", size = 12 } = params;
    validateCoordinate(longitude, latitude);
    const cesiumColor = parseColor(color);
    return viewer.entities.add({
      position: Cesium4.Cartesian3.fromDegrees(longitude, latitude),
      point: {
        pixelSize: size,
        color: cesiumColor,
        outlineColor: Cesium4.Color.WHITE,
        outlineWidth: 1,
        heightReference: Cesium4.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      },
      label: label ? {
        text: label,
        font: "13px sans-serif",
        fillColor: Cesium4.Color.WHITE,
        outlineColor: Cesium4.Color.BLACK,
        outlineWidth: 2,
        style: Cesium4.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium4.Cartesian2(0, -18),
        verticalOrigin: Cesium4.VerticalOrigin.BOTTOM,
        heightReference: Cesium4.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      } : void 0
    });
  }
  function addPolyline(viewer, params) {
    const { coordinates, color = "#3B82F6", width = 3, clampToGround = true, label } = params;
    const cesiumColor = parseColor(color);
    const positions = coordinates.map((c) => {
      validateCoordinate(c[0], c[1], c[2]);
      return Cesium4.Cartesian3.fromDegrees(c[0], c[1], c[2] ?? 0);
    });
    const midIdx = Math.floor(positions.length / 2);
    return viewer.entities.add({
      position: label ? positions[midIdx] : void 0,
      polyline: {
        positions,
        width,
        material: cesiumColor,
        clampToGround
      },
      label: label ? {
        text: label,
        font: "13px sans-serif",
        fillColor: Cesium4.Color.WHITE,
        outlineColor: Cesium4.Color.BLACK,
        outlineWidth: 2,
        style: Cesium4.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium4.Cartesian2(0, -12),
        verticalOrigin: Cesium4.VerticalOrigin.BOTTOM,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      } : void 0
    });
  }
  function addPolygon(viewer, params) {
    const { coordinates, color = "#3B82F6", outlineColor = "#FFFFFF", opacity = 0.6, extrudedHeight, clampToGround = true, label } = params;
    const fillColor = parseColor(color).withAlpha(opacity);
    const strokeColor = parseColor(outlineColor);
    const positions = coordinates.map((c) => {
      validateCoordinate(c[0], c[1], c[2]);
      return Cesium4.Cartesian3.fromDegrees(c[0], c[1], c[2] ?? 0);
    });
    const centroid = centroidOfCoords(coordinates.map((c) => [c[0], c[1]]));
    return viewer.entities.add({
      position: label && centroid ? Cesium4.Cartesian3.fromDegrees(centroid[0], centroid[1]) : void 0,
      polygon: {
        hierarchy: new Cesium4.PolygonHierarchy(positions),
        material: fillColor,
        outline: true,
        outlineColor: strokeColor,
        outlineWidth: 1,
        heightReference: clampToGround ? Cesium4.HeightReference.CLAMP_TO_GROUND : Cesium4.HeightReference.NONE,
        extrudedHeight
      },
      label: label ? {
        text: label,
        font: "13px sans-serif",
        fillColor: Cesium4.Color.WHITE,
        outlineColor: Cesium4.Color.BLACK,
        outlineWidth: 2,
        style: Cesium4.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium4.VerticalOrigin.BOTTOM,
        heightReference: Cesium4.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      } : void 0
    });
  }
  function addModel(viewer, params) {
    const { longitude, latitude, height = 0, url, scale = 1, heading = 0, pitch = 0, roll = 0, label } = params;
    validateCoordinate(longitude, latitude, height);
    const position = Cesium4.Cartesian3.fromDegrees(longitude, latitude, height);
    const hpr = new Cesium4.HeadingPitchRoll(
      Cesium4.Math.toRadians(heading),
      Cesium4.Math.toRadians(pitch),
      Cesium4.Math.toRadians(roll)
    );
    const orientation = Cesium4.Transforms.headingPitchRollQuaternion(position, hpr);
    return viewer.entities.add({
      position,
      orientation,
      model: {
        uri: url,
        scale
      },
      label: label ? {
        text: label,
        font: "13px sans-serif",
        fillColor: Cesium4.Color.WHITE,
        outlineColor: Cesium4.Color.BLACK,
        outlineWidth: 2,
        style: Cesium4.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium4.Cartesian2(0, -24),
        verticalOrigin: Cesium4.VerticalOrigin.BOTTOM,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      } : void 0
    });
  }
  function updateEntity(viewer, params) {
    const entity = viewer.entities.getById(params.entityId);
    if (!entity) return false;
    if (params.position) {
      const { longitude, latitude, height } = params.position;
      validateCoordinate(longitude, latitude, height);
      entity.position = new Cesium4.ConstantPositionProperty(
        Cesium4.Cartesian3.fromDegrees(longitude, latitude, height ?? 0)
      );
    }
    if (params.label !== void 0 && entity.label) {
      entity.label.text = new Cesium4.ConstantProperty(params.label);
    }
    if (params.color !== void 0) {
      const c = parseColor(params.color);
      if (entity.point) entity.point.color = new Cesium4.ConstantProperty(c);
      if (entity.polyline) entity.polyline.material = new Cesium4.ColorMaterialProperty(c);
      if (entity.polygon) entity.polygon.material = new Cesium4.ColorMaterialProperty(c);
    }
    if (params.scale !== void 0) {
      if (entity.model) entity.model.scale = new Cesium4.ConstantProperty(params.scale);
      if (entity.label) entity.label.scale = new Cesium4.ConstantProperty(params.scale);
    }
    if (params.show !== void 0) {
      entity.show = params.show;
    }
    return true;
  }
  function removeEntity(viewer, entityId) {
    const entity = viewer.entities.getById(entityId);
    if (!entity) return false;
    return viewer.entities.remove(entity);
  }
  function batchAddEntities(viewer, entities, helpers) {
    const entityIds = [];
    const errors = [];
    viewer.entities.suspendEvents();
    try {
      for (let i = 0; i < entities.length; i++) {
        const def = entities[i];
        const { type, ...params } = def;
        try {
          const fn = helpers[type === "marker" ? "addMarker" : type === "polyline" ? "addPolyline" : type === "polygon" ? "addPolygon" : type === "model" ? "addModel" : type === "billboard" ? "addBillboard" : type === "box" ? "addBox" : type === "cylinder" ? "addCylinder" : type === "ellipse" ? "addEllipse" : type === "rectangle" ? "addRectangle" : type === "wall" ? "addWall" : type === "corridor" ? "addCorridor" : null];
          if (!fn) {
            errors.push(`[${i}] Unknown type: ${type}`);
            continue;
          }
          const entity = fn(params);
          entityIds.push(entity.id);
        } catch (err) {
          errors.push(`[${i}] ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } finally {
      viewer.entities.resumeEvents();
    }
    return { entityIds, errors };
  }
  function queryEntities(viewer, params) {
    const results = [];
    for (const entity of viewer.entities.values) {
      matchEntityForQuery(entity, params, results);
    }
    const dsColl = viewer.dataSources;
    if (dsColl) {
      for (let i = 0; i < dsColl.length; i++) {
        const ds = dsColl.get(i);
        for (const entity of ds.entities.values) {
          matchEntityForQuery(entity, params, results);
        }
      }
    }
    return results;
  }
  function matchEntityForQuery(entity, params, results) {
    const type = detectEntityType(entity);
    if (params.type && type !== params.type) return;
    const name = entity.name ?? entity.label?.text?.getValue(Cesium4.JulianDate.now()) ?? void 0;
    if (params.name && name && !String(name).toLowerCase().includes(params.name.toLowerCase())) return;
    if (params.name && !name) return;
    let position;
    if (entity.position) {
      const pos = entity.position.getValue(Cesium4.JulianDate.now());
      if (pos) {
        const carto = Cesium4.Cartographic.fromCartesian(pos);
        position = {
          longitude: Cesium4.Math.toDegrees(carto.longitude),
          latitude: Cesium4.Math.toDegrees(carto.latitude),
          height: carto.height
        };
      }
    }
    if (!position) {
      position = computeEntityCentroid(entity);
    }
    if (params.bbox && position) {
      const [west, south, east, north] = params.bbox;
      const entityBbox = computeEntityBbox(entity);
      if (entityBbox) {
        if (entityBbox[2] < west || entityBbox[0] > east || entityBbox[3] < south || entityBbox[1] > north) return;
      } else {
        if (position.longitude < west || position.longitude > east || position.latitude < south || position.latitude > north) return;
      }
    } else if (params.bbox && !position) {
      return;
    }
    results.push({
      entityId: entity.id,
      name: name ? String(name) : void 0,
      type,
      position
    });
  }
  function computeEntityCentroid(entity) {
    const now = Cesium4.JulianDate.now();
    let positions;
    if (entity.polygon?.hierarchy) {
      const h = entity.polygon.hierarchy.getValue(now);
      if (h?.positions) positions = h.positions;
    } else if (entity.polyline?.positions) {
      positions = entity.polyline.positions.getValue(now);
    } else if (entity.corridor?.positions) {
      positions = entity.corridor.positions.getValue(now);
    } else if (entity.rectangle?.coordinates) {
      const rect = entity.rectangle.coordinates.getValue(now);
      if (rect) {
        return {
          longitude: Cesium4.Math.toDegrees((rect.west + rect.east) / 2),
          latitude: Cesium4.Math.toDegrees((rect.south + rect.north) / 2),
          height: 0
        };
      }
    } else if (entity.wall?.positions) {
      positions = entity.wall.positions.getValue(now);
    }
    if (!positions || positions.length === 0) return void 0;
    let lonSum = 0, latSum = 0, hSum = 0;
    for (const p of positions) {
      const c = Cesium4.Cartographic.fromCartesian(p);
      lonSum += Cesium4.Math.toDegrees(c.longitude);
      latSum += Cesium4.Math.toDegrees(c.latitude);
      hSum += c.height;
    }
    const n = positions.length;
    return { longitude: lonSum / n, latitude: latSum / n, height: hSum / n };
  }
  function computeEntityBbox(entity) {
    const now = Cesium4.JulianDate.now();
    let positions;
    if (entity.polygon?.hierarchy) {
      const h = entity.polygon.hierarchy.getValue(now);
      if (h?.positions) positions = h.positions;
    } else if (entity.polyline?.positions) {
      positions = entity.polyline.positions.getValue(now);
    } else if (entity.corridor?.positions) {
      positions = entity.corridor.positions.getValue(now);
    } else if (entity.rectangle?.coordinates) {
      const rect = entity.rectangle.coordinates.getValue(now);
      if (rect) {
        return [
          Cesium4.Math.toDegrees(rect.west),
          Cesium4.Math.toDegrees(rect.south),
          Cesium4.Math.toDegrees(rect.east),
          Cesium4.Math.toDegrees(rect.north)
        ];
      }
    } else if (entity.wall?.positions) {
      positions = entity.wall.positions.getValue(now);
    }
    if (!positions || positions.length === 0) return void 0;
    let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
    for (const p of positions) {
      const c = Cesium4.Cartographic.fromCartesian(p);
      const lon = Cesium4.Math.toDegrees(c.longitude);
      const lat = Cesium4.Math.toDegrees(c.latitude);
      if (lon < west) west = lon;
      if (lon > east) east = lon;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
    }
    return [west, south, east, north];
  }
  function detectEntityType(entity) {
    if (entity.point) return "marker";
    if (entity.billboard) return "billboard";
    if (entity.polyline) return "polyline";
    if (entity.polygon) return "polygon";
    if (entity.model) return "model";
    if (entity.box) return "box";
    if (entity.cylinder) return "cylinder";
    if (entity.ellipse) return "ellipse";
    if (entity.rectangle) return "rectangle";
    if (entity.wall) return "wall";
    if (entity.corridor) return "corridor";
    if (entity.label && !entity.point) return "label";
    return "unknown";
  }
  function extractGraphicProperties(entity, type) {
    const now = Cesium4.JulianDate.now();
    const props = {};
    const tryGetValue = (prop) => {
      if (prop == null) return void 0;
      try {
        if (typeof prop.getValue === "function") return prop.getValue(now);
      } catch {
        return void 0;
      }
      return prop;
    };
    const extractColor = (colorProp) => {
      const c = tryGetValue(colorProp);
      if (c && typeof c.toCssColorString === "function") return c.toCssColorString();
      return void 0;
    };
    const extractMaterialColor = (materialProp) => {
      const mat = tryGetValue(materialProp);
      if (!mat) return void 0;
      if (mat.color && typeof mat.color.toCssColorString === "function") return mat.color.toCssColorString();
      if (typeof mat.toCssColorString === "function") return mat.toCssColorString();
      if (materialProp?.color) return extractColor(materialProp.color);
      return void 0;
    };
    const extractPositions = (posProp) => {
      const positions = tryGetValue(posProp);
      if (!Array.isArray(positions) || positions.length === 0) return void 0;
      try {
        return positions.map((p) => {
          const c = Cesium4.Cartographic.fromCartesian(p);
          return [
            Cesium4.Math.toDegrees(c.longitude),
            Cesium4.Math.toDegrees(c.latitude),
            c.height
          ];
        });
      } catch {
        return void 0;
      }
    };
    switch (type) {
      case "marker": {
        const pt = entity.point;
        props.pixelSize = tryGetValue(pt.pixelSize);
        props.color = extractColor(pt.color);
        props.outlineColor = extractColor(pt.outlineColor);
        props.outlineWidth = tryGetValue(pt.outlineWidth);
        break;
      }
      case "polyline": {
        const pl = entity.polyline;
        props.width = tryGetValue(pl.width);
        props.clampToGround = tryGetValue(pl.clampToGround);
        props.color = extractMaterialColor(pl.material);
        props.positions = extractPositions(pl.positions);
        break;
      }
      case "polygon": {
        const pg = entity.polygon;
        props.extrudedHeight = tryGetValue(pg.extrudedHeight);
        props.fill = tryGetValue(pg.fill);
        props.outline = tryGetValue(pg.outline);
        props.color = extractMaterialColor(pg.material);
        const hierarchy = tryGetValue(pg.hierarchy);
        if (hierarchy?.positions) {
          props.positions = extractPositions({ getValue: () => hierarchy.positions });
        }
        break;
      }
      case "model": {
        const m = entity.model;
        props.scale = tryGetValue(m.scale);
        props.minimumPixelSize = tryGetValue(m.minimumPixelSize);
        props.uri = tryGetValue(m.uri);
        props.silhouetteColor = extractColor(m.silhouetteColor);
        break;
      }
      case "billboard": {
        const bb = entity.billboard;
        props.width = tryGetValue(bb.width);
        props.height = tryGetValue(bb.height);
        props.scale = tryGetValue(bb.scale);
        props.rotation = tryGetValue(bb.rotation);
        props.color = extractColor(bb.color);
        break;
      }
      case "label": {
        const lb = entity.label;
        props.text = tryGetValue(lb.text);
        props.font = tryGetValue(lb.font);
        props.fillColor = extractColor(lb.fillColor);
        props.outlineColor = extractColor(lb.outlineColor);
        props.scale = tryGetValue(lb.scale);
        break;
      }
      case "box": {
        const bx = entity.box;
        const dims = tryGetValue(bx.dimensions);
        if (dims && "x" in dims && "y" in dims && "z" in dims) {
          props.dimensions = { x: dims.x, y: dims.y, z: dims.z };
        }
        props.color = extractMaterialColor(bx.material);
        break;
      }
      case "cylinder": {
        const cy = entity.cylinder;
        props.length = tryGetValue(cy.length);
        props.topRadius = tryGetValue(cy.topRadius);
        props.bottomRadius = tryGetValue(cy.bottomRadius);
        props.color = extractMaterialColor(cy.material);
        break;
      }
      case "ellipse": {
        const el = entity.ellipse;
        props.semiMajorAxis = tryGetValue(el.semiMajorAxis);
        props.semiMinorAxis = tryGetValue(el.semiMinorAxis);
        props.color = extractMaterialColor(el.material);
        break;
      }
      case "rectangle": {
        const rc = entity.rectangle;
        const rect = tryGetValue(rc.coordinates);
        if (rect && "west" in rect && "south" in rect && "east" in rect && "north" in rect) {
          props.coordinates = {
            west: Cesium4.Math.toDegrees(rect.west),
            south: Cesium4.Math.toDegrees(rect.south),
            east: Cesium4.Math.toDegrees(rect.east),
            north: Cesium4.Math.toDegrees(rect.north)
          };
        }
        props.color = extractMaterialColor(rc.material);
        break;
      }
      case "wall": {
        const w = entity.wall;
        props.color = extractMaterialColor(w.material);
        props.positions = extractPositions(w.positions);
        break;
      }
      case "corridor": {
        const co = entity.corridor;
        props.width = tryGetValue(co.width);
        props.color = extractMaterialColor(co.material);
        props.positions = extractPositions(co.positions);
        break;
      }
    }
    for (const key of Object.keys(props)) {
      if (props[key] === void 0) delete props[key];
    }
    return props;
  }
  function findEntityById(viewer, entityId) {
    const entity = viewer.entities.getById(entityId);
    if (entity) return entity;
    const dsColl = viewer.dataSources;
    if (dsColl) {
      for (let i = 0; i < dsColl.length; i++) {
        const found = dsColl.get(i).entities.getById(entityId);
        if (found) return found;
      }
    }
    return void 0;
  }
  function getEntityProperties(viewer, params) {
    const entity = findEntityById(viewer, params.entityId);
    if (!entity) throw new Error(`Entity not found: ${params.entityId}`);
    const type = detectEntityType(entity);
    let position;
    if (entity.position) {
      const pos = entity.position.getValue(Cesium4.JulianDate.now());
      if (pos) {
        const carto = Cesium4.Cartographic.fromCartesian(pos);
        position = {
          longitude: Cesium4.Math.toDegrees(carto.longitude),
          latitude: Cesium4.Math.toDegrees(carto.latitude),
          height: carto.height
        };
      }
    }
    if (!position) {
      position = computeEntityCentroid(entity);
    }
    const properties = {};
    if (entity.properties) {
      const names = entity.properties.propertyNames;
      for (const name of names) {
        try {
          const val = entity.properties[name]?.getValue(Cesium4.JulianDate.now());
          properties[name] = val;
        } catch {
          properties[name] = void 0;
        }
      }
    }
    let description;
    if (entity.description) {
      try {
        const desc = entity.description.getValue(Cesium4.JulianDate.now());
        if (typeof desc === "string") description = desc;
      } catch {
      }
    }
    const graphicProperties = extractGraphicProperties(entity, type);
    return {
      entityId: entity.id,
      name: entity.name ?? void 0,
      type,
      position,
      properties,
      graphicProperties,
      description
    };
  }
  function computeFeatureCentroid(feature) {
    const geom = feature?.geometry;
    if (!geom) return null;
    const type = geom.type ?? "";
    const coords = geom.coordinates;
    if (type === "Point") {
      return [coords[0], coords[1]];
    }
    if (type === "MultiPoint" || type === "LineString") {
      return centroidOfCoords(coords);
    }
    if (type === "MultiLineString" || type === "Polygon") {
      const ring = type === "Polygon" ? coords[0] : coords.flat();
      return centroidOfCoords(ring);
    }
    if (type === "MultiPolygon") {
      const ring = coords[0]?.[0];
      return ring ? centroidOfCoords(ring) : null;
    }
    return null;
  }
  function centroidOfCoords(coords) {
    if (!coords?.length) return null;
    let sumLon = 0;
    let sumLat = 0;
    for (const c of coords) {
      sumLon += c[0];
      sumLat += c[1];
    }
    return [sumLon / coords.length, sumLat / coords.length];
  }

  // src/commands/interaction.ts
  var Cesium5 = __toESM(require_cesium());
  function screenshot(viewer) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          const canvas = viewer.scene.canvas;
          const dataUrl = canvas.toDataURL("image/png");
          resolve({ dataUrl, width: canvas.width, height: canvas.height });
        } catch {
          reject(new Error("Screenshot timeout: postRender did not fire within 5s"));
        }
      }, 5e3);
      viewer.scene.requestRender();
      const removeListener = viewer.scene.postRender.addEventListener(() => {
        removeListener();
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        const canvas = viewer.scene.canvas;
        const dataUrl = canvas.toDataURL("image/png");
        resolve({
          dataUrl,
          width: canvas.width,
          height: canvas.height
        });
      });
    });
  }
  var _highlightBackups = /* @__PURE__ */ new Map();
  function highlight(viewer, layerManager, params) {
    const { layerId, featureIndex, color = "#FFFF00", clear } = params;
    if (clear) {
      if (layerId) {
        const refs2 = layerManager.getCesiumRefs(layerId);
        if (refs2?.dataSource) {
          for (const entity of refs2.dataSource.entities.values) {
            restoreEntityStyle(entity);
          }
        }
      } else {
        const dsColl = viewer.dataSources;
        if (dsColl) {
          for (let i = 0; i < dsColl.length; i++) {
            for (const entity of dsColl.get(i).entities.values) {
              restoreEntityStyle(entity);
            }
          }
        }
        for (const entity of viewer.entities.values) {
          restoreEntityStyle(entity);
        }
      }
      return;
    }
    if (!layerId) return;
    const refs = layerManager.getCesiumRefs(layerId);
    if (!refs?.dataSource) return;
    const entities = refs.dataSource.entities.values;
    const highlightColor = parseColor(color).withAlpha(0.8);
    if (featureIndex != null && featureIndex < entities.length) {
      const entity = entities[featureIndex];
      backupAndHighlight(entity, highlightColor);
    } else {
      for (const entity of entities) {
        backupAndHighlight(entity, highlightColor);
      }
    }
  }
  function backupAndHighlight(entity, color) {
    if (!_highlightBackups.has(entity.id)) {
      const b = {};
      if (entity.polygon) b.polygonMaterial = entity.polygon.material;
      if (entity.polyline) {
        b.polylineMaterial = entity.polyline.material;
        b.polylineWidth = entity.polyline.width;
      }
      if (entity.point) {
        b.pointColor = entity.point.color;
        b.pointPixelSize = entity.point.pixelSize;
      }
      if (entity.billboard) b.billboardColor = entity.billboard.color;
      if (entity.model) {
        b.modelSilhouetteColor = entity.model.silhouetteColor;
        b.modelSilhouetteSize = entity.model.silhouetteSize;
      }
      if (entity.label) b.labelFillColor = entity.label.fillColor;
      if (entity.box) b.boxMaterial = entity.box.material;
      if (entity.cylinder) b.cylinderMaterial = entity.cylinder.material;
      if (entity.ellipse) b.ellipseMaterial = entity.ellipse.material;
      if (entity.rectangle) b.rectangleMaterial = entity.rectangle.material;
      if (entity.wall) b.wallMaterial = entity.wall.material;
      if (entity.corridor) b.corridorMaterial = entity.corridor.material;
      _highlightBackups.set(entity.id, b);
    }
    applyHighlight(entity, color);
  }
  function restoreEntityStyle(entity) {
    const b = _highlightBackups.get(entity.id);
    if (!b) return;
    if (entity.polygon) entity.polygon.material = b.polygonMaterial;
    if (entity.polyline) {
      entity.polyline.material = b.polylineMaterial;
      entity.polyline.width = b.polylineWidth;
    }
    if (entity.point) {
      entity.point.color = b.pointColor;
      entity.point.pixelSize = b.pointPixelSize;
    }
    if (entity.billboard) entity.billboard.color = b.billboardColor;
    if (entity.model) {
      entity.model.silhouetteColor = b.modelSilhouetteColor;
      entity.model.silhouetteSize = b.modelSilhouetteSize;
    }
    if (entity.label) entity.label.fillColor = b.labelFillColor;
    if (entity.box) entity.box.material = b.boxMaterial;
    if (entity.cylinder) entity.cylinder.material = b.cylinderMaterial;
    if (entity.ellipse) entity.ellipse.material = b.ellipseMaterial;
    if (entity.rectangle) entity.rectangle.material = b.rectangleMaterial;
    if (entity.wall) entity.wall.material = b.wallMaterial;
    if (entity.corridor) entity.corridor.material = b.corridorMaterial;
    _highlightBackups.delete(entity.id);
  }
  function applyHighlight(entity, color) {
    const mat = new Cesium5.ColorMaterialProperty(color);
    const colorProp = new Cesium5.ConstantProperty(color);
    if (entity.polygon) {
      entity.polygon.material = mat;
    } else if (entity.polyline) {
      entity.polyline.material = mat;
      entity.polyline.width = new Cesium5.ConstantProperty(3);
    } else if (entity.point) {
      entity.point.color = colorProp;
      entity.point.pixelSize = new Cesium5.ConstantProperty(16);
    } else if (entity.billboard) {
      entity.billboard.color = colorProp;
    } else if (entity.model) {
      entity.model.silhouetteColor = colorProp;
      entity.model.silhouetteSize = new Cesium5.ConstantProperty(2);
    } else if (entity.label) {
      entity.label.fillColor = colorProp;
    } else if (entity.box) {
      entity.box.material = mat;
    } else if (entity.cylinder) {
      entity.cylinder.material = mat;
    } else if (entity.ellipse) {
      entity.ellipse.material = mat;
    } else if (entity.rectangle) {
      entity.rectangle.material = mat;
    } else if (entity.wall) {
      entity.wall.material = mat;
    } else if (entity.corridor) {
      entity.corridor.material = mat;
    }
  }
  function measure(viewer, params) {
    const { mode, positions, showOnMap = true, id } = params;
    if (positions.length < 2)
      throw new Error("At least 2 positions required");
    if (mode === "area" && positions.length < 3)
      throw new Error("At least 3 positions required for area measurement");
    const cartoPositions = positions.map(
      ([lon, lat, alt]) => Cesium5.Cartographic.fromDegrees(lon, lat, alt ?? 0)
    );
    if (mode === "distance") {
      const segments = [];
      const geodesic = new Cesium5.EllipsoidGeodesic();
      for (let i = 0; i < cartoPositions.length - 1; i++) {
        geodesic.setEndPoints(cartoPositions[i], cartoPositions[i + 1]);
        segments.push(geodesic.surfaceDistance);
      }
      const totalMeters = segments.reduce((a, b) => a + b, 0);
      if (showOnMap) {
        const cartesians2 = positions.map(
          ([lon, lat, alt]) => Cesium5.Cartesian3.fromDegrees(lon, lat, alt ?? 0)
        );
        const measureId = id ?? `measure_${Date.now()}`;
        viewer.entities.removeById(measureId);
        viewer.entities.removeById(`${measureId}_label`);
        viewer.entities.add({
          id: measureId,
          polyline: {
            positions: cartesians2,
            width: 3,
            material: new Cesium5.PolylineDashMaterialProperty({
              color: Cesium5.Color.YELLOW,
              dashLength: 16
            }),
            clampToGround: true
          }
        });
        const midIdx = Math.floor(positions.length / 2);
        const mid = positions[midIdx];
        viewer.entities.add({
          id: `${measureId}_label`,
          position: Cesium5.Cartesian3.fromDegrees(mid[0], mid[1], (mid[2] ?? 0) + 50),
          label: {
            text: totalMeters >= 1e3 ? `${(totalMeters / 1e3).toFixed(2)} km` : `${totalMeters.toFixed(1)} m`,
            font: "14px sans-serif",
            fillColor: Cesium5.Color.YELLOW,
            outlineColor: Cesium5.Color.BLACK,
            outlineWidth: 2,
            style: Cesium5.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium5.Cartesian2(0, -20),
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        });
      }
      return {
        mode: "distance",
        value: totalMeters >= 1e3 ? +(totalMeters / 1e3).toFixed(3) : +totalMeters.toFixed(1),
        unit: totalMeters >= 1e3 ? "km" : "m",
        segments: segments.map((s) => +s.toFixed(1)),
        id
      };
    }
    const cartesians = positions.map(
      ([lon, lat, alt]) => Cesium5.Cartesian3.fromDegrees(lon, lat, alt ?? 0)
    );
    const areaSqM = computeSphericalArea(cartoPositions);
    if (showOnMap) {
      const measureId = id ?? `measure_${Date.now()}`;
      viewer.entities.removeById(measureId);
      viewer.entities.removeById(`${measureId}_label`);
      viewer.entities.add({
        id: measureId,
        polygon: {
          hierarchy: new Cesium5.PolygonHierarchy(cartesians),
          material: Cesium5.Color.YELLOW.withAlpha(0.3),
          outline: true,
          outlineColor: Cesium5.Color.YELLOW,
          outlineWidth: 2
        }
      });
      const center = Cesium5.BoundingSphere.fromPoints(cartesians).center;
      const centerCarto = Cesium5.Cartographic.fromCartesian(center);
      viewer.entities.add({
        id: `${measureId}_label`,
        position: Cesium5.Cartesian3.fromRadians(
          centerCarto.longitude,
          centerCarto.latitude,
          centerCarto.height + 50
        ),
        label: {
          text: areaSqM >= 1e6 ? `${(areaSqM / 1e6).toFixed(3)} km\xB2` : `${areaSqM.toFixed(1)} m\xB2`,
          font: "14px sans-serif",
          fillColor: Cesium5.Color.YELLOW,
          outlineColor: Cesium5.Color.BLACK,
          outlineWidth: 2,
          style: Cesium5.LabelStyle.FILL_AND_OUTLINE,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      });
    }
    return {
      mode: "area",
      value: areaSqM >= 1e6 ? +(areaSqM / 1e6).toFixed(3) : +areaSqM.toFixed(1),
      unit: areaSqM >= 1e6 ? "km\xB2" : "m\xB2",
      id
    };
  }
  function computeSphericalArea(cartoPositions) {
    const R = 63710088e-1;
    const n = cartoPositions.length;
    if (n < 3) return 0;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const a = cartoPositions[i];
      const b = cartoPositions[(i + 1) % n];
      sum += (b.longitude - a.longitude) * (2 + Math.sin(a.latitude) + Math.sin(b.latitude));
    }
    return Math.abs(sum * R * R / 2);
  }

  // src/commands/trajectory.ts
  var Cesium6 = __toESM(require_cesium());
  function playTrajectory(viewer, params) {
    const {
      id,
      coordinates,
      durationSeconds = 30,
      trailSeconds = 5,
      label
    } = params;
    const entityId = id ?? `trajectory_${Date.now()}`;
    const totalPoints = coordinates.length;
    const startTime = Cesium6.JulianDate.now();
    const stopTime = Cesium6.JulianDate.addSeconds(startTime, durationSeconds, new Cesium6.JulianDate());
    const segDists = [0];
    for (let i = 1; i < totalPoints; i++) {
      const [lon0, lat0] = coordinates[i - 1];
      const [lon1, lat1] = coordinates[i];
      const dlat = (lat1 - lat0) * Math.PI / 180;
      const dlon = (lon1 - lon0) * Math.PI / 180;
      const a = Math.sin(dlat / 2) ** 2 + Math.cos(lat0 * Math.PI / 180) * Math.cos(lat1 * Math.PI / 180) * Math.sin(dlon / 2) ** 2;
      const dist = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      segDists.push(segDists[i - 1] + dist);
    }
    const totalDist = segDists[totalPoints - 1];
    const positionProperty = new Cesium6.SampledPositionProperty();
    positionProperty.setInterpolationOptions({
      interpolationDegree: 1,
      // Cesium 1.143's declaration omits runtime fields from this namespace.
      interpolationAlgorithm: Cesium6.LinearApproximation
    });
    for (let i = 0; i < totalPoints; i++) {
      const fraction = totalDist > 0 ? segDists[i] / totalDist : i / (totalPoints - 1);
      const time = Cesium6.JulianDate.addSeconds(startTime, fraction * durationSeconds, new Cesium6.JulianDate());
      const coord = coordinates[i];
      const lon = coord[0];
      const lat = coord[1];
      const alt = coord.length > 2 ? coord[2] ?? 0 : 0;
      positionProperty.addSample(time, Cesium6.Cartesian3.fromDegrees(lon, lat, alt));
    }
    const pathPositions = coordinates.map(
      (c) => Cesium6.Cartesian3.fromDegrees(c[0], c[1], c.length > 2 ? c[2] ?? 0 : 0)
    );
    const trailEntity = viewer.entities.add({
      id: `${entityId}_trail`,
      polyline: {
        positions: pathPositions,
        width: 2,
        material: new Cesium6.PolylineGlowMaterialProperty({
          glowPower: 0.2,
          color: Cesium6.Color.CYAN.withAlpha(0.6)
        }),
        clampToGround: true
      }
    });
    const movingEntity = viewer.entities.add({
      id: entityId,
      position: positionProperty,
      orientation: new Cesium6.VelocityOrientationProperty(positionProperty),
      point: {
        pixelSize: 12,
        color: Cesium6.Color.fromCssColorString("#F59E0B"),
        outlineColor: Cesium6.Color.WHITE,
        outlineWidth: 2
      },
      path: {
        leadTime: 0,
        trailTime: trailSeconds,
        width: 4,
        material: new Cesium6.PolylineGlowMaterialProperty({
          glowPower: 0.3,
          color: Cesium6.Color.fromCssColorString("#F59E0B")
        })
      },
      label: label ? {
        text: label,
        font: "14px sans-serif",
        fillColor: Cesium6.Color.WHITE,
        outlineColor: Cesium6.Color.BLACK,
        outlineWidth: 2,
        style: Cesium6.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium6.Cartesian2(0, -24),
        verticalOrigin: Cesium6.VerticalOrigin.BOTTOM
      } : void 0
    });
    const clock = viewer.clock;
    clock.startTime = startTime.clone();
    clock.stopTime = stopTime.clone();
    clock.currentTime = startTime.clone();
    clock.clockRange = Cesium6.ClockRange.LOOP_STOP;
    clock.multiplier = 1;
    clock.shouldAnimate = true;
    if (viewer.timeline) {
      viewer.timeline.zoomTo(startTime, stopTime);
    }
    const lons = coordinates.map((c) => c[0]);
    const lats = coordinates.map((c) => c[1]);
    const pad = 5e-3;
    const west = Math.min(...lons) - pad;
    const south = Math.min(...lats) - pad;
    const east = Math.max(...lons) + pad;
    const north = Math.max(...lats) + pad;
    viewer.camera.flyTo({
      destination: Cesium6.Rectangle.fromDegrees(west, south, east, north),
      orientation: { heading: 0, pitch: Cesium6.Math.toRadians(-90), roll: 0 },
      duration: 1.5
    });
    const stop = () => {
      clock.shouldAnimate = false;
      viewer.trackedEntity = void 0;
      viewer.entities.remove(movingEntity);
      viewer.entities.remove(trailEntity);
    };
    const pause = () => {
      clock.shouldAnimate = false;
    };
    const resume = () => {
      clock.shouldAnimate = true;
    };
    const isPlaying = () => clock.shouldAnimate;
    return { entityId, stop, pause, resume, isPlaying, movingEntity, trailEntity };
  }

  // src/commands/camera.ts
  var Cesium7 = __toESM(require_cesium());
  function lookAtTransform(viewer, params) {
    const { longitude, latitude, height = 0, heading = 0, pitch = -45, range = 1e3 } = params;
    validateCoordinate(longitude, latitude, height);
    const center = Cesium7.Cartesian3.fromDegrees(longitude, latitude, height);
    const transform = Cesium7.Transforms.eastNorthUpToFixedFrame(center);
    const hpr = new Cesium7.HeadingPitchRange(
      Cesium7.Math.toRadians(heading),
      Cesium7.Math.toRadians(pitch),
      range
    );
    viewer.camera.lookAtTransform(transform, hpr);
  }
  function startOrbit(viewer, params, existingHandler) {
    if (existingHandler) existingHandler();
    const speed = params.speed ?? 5e-3;
    const direction = params.clockwise ?? true ? -1 : 1;
    const handler = viewer.clock.onTick.addEventListener(() => {
      viewer.camera.rotateRight(speed * direction);
    });
    return handler;
  }
  function stopOrbit(handler) {
    if (handler) handler();
  }
  function setCameraOptions(viewer, params) {
    const ctrl = viewer.scene.screenSpaceCameraController;
    const fields = [
      "enableRotate",
      "enableTranslate",
      "enableZoom",
      "enableTilt",
      "enableLook",
      "minimumZoomDistance",
      "maximumZoomDistance",
      "enableInputs"
    ];
    for (const key of fields) {
      if (params[key] !== void 0) {
        ctrl[key] = params[key];
      }
    }
  }

  // src/commands/entity-types.ts
  var Cesium8 = __toESM(require_cesium());
  function addBillboard(viewer, params) {
    const position = Cesium8.Cartesian3.fromDegrees(params.longitude, params.latitude, params.height ?? 0);
    return viewer.entities.add({
      name: params.name,
      position,
      billboard: {
        image: params.image,
        scale: params.scale ?? 1,
        color: params.color ? parseColor(params.color) : void 0,
        pixelOffset: new Cesium8.Cartesian2(params.pixelOffset?.x ?? 0, params.pixelOffset?.y ?? 0),
        horizontalOrigin: Cesium8.HorizontalOrigin[params.horizontalOrigin ?? "CENTER"],
        verticalOrigin: Cesium8.VerticalOrigin[params.verticalOrigin ?? "CENTER"],
        heightReference: Cesium8.HeightReference[params.heightReference ?? "NONE"],
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    });
  }
  function addBox(viewer, params) {
    const position = Cesium8.Cartesian3.fromDegrees(params.longitude, params.latitude, params.height ?? 0);
    const opts = {
      name: params.name,
      position,
      box: {
        dimensions: new Cesium8.Cartesian3(
          params.dimensions.width,
          params.dimensions.length,
          params.dimensions.height
        ),
        material: resolveMaterial(params.material),
        outline: params.outline ?? true,
        outlineColor: params.outlineColor ? parseColor(params.outlineColor) : void 0,
        fill: params.fill ?? true,
        heightReference: params.heightReference ? Cesium8.HeightReference[params.heightReference] : void 0
      }
    };
    if (params.orientation) {
      opts.orientation = resolveOrientation(position, params.orientation);
    }
    return viewer.entities.add(opts);
  }
  function addCorridor(viewer, params) {
    const posArray = params.positions.flatMap((p) => [p.longitude, p.latitude, p.height ?? 0]);
    return viewer.entities.add({
      name: params.name,
      corridor: {
        positions: Cesium8.Cartesian3.fromDegreesArrayHeights(posArray),
        width: params.width,
        material: resolveMaterial(params.material),
        cornerType: params.cornerType ? Cesium8.CornerType[params.cornerType] : Cesium8.CornerType.ROUNDED,
        height: params.height,
        extrudedHeight: params.extrudedHeight,
        outline: params.outline ?? false,
        outlineColor: params.outlineColor ? parseColor(params.outlineColor) : void 0
      }
    });
  }
  function addCylinder(viewer, params) {
    const position = Cesium8.Cartesian3.fromDegrees(params.longitude, params.latitude, params.height ?? 0);
    const opts = {
      name: params.name,
      position,
      cylinder: {
        length: params.length,
        topRadius: params.topRadius,
        bottomRadius: params.bottomRadius,
        material: resolveMaterial(params.material),
        outline: params.outline ?? true,
        outlineColor: params.outlineColor ? parseColor(params.outlineColor) : void 0,
        fill: params.fill ?? true,
        numberOfVerticalLines: params.numberOfVerticalLines ?? 16,
        slices: params.slices ?? 128
      }
    };
    if (params.orientation) {
      opts.orientation = resolveOrientation(position, params.orientation);
    }
    return viewer.entities.add(opts);
  }
  function addEllipse(viewer, params) {
    const position = Cesium8.Cartesian3.fromDegrees(params.longitude, params.latitude, params.height ?? 0);
    return viewer.entities.add({
      name: params.name,
      position,
      ellipse: {
        semiMajorAxis: params.semiMajorAxis,
        semiMinorAxis: params.semiMinorAxis,
        material: resolveMaterial(params.material),
        height: params.height,
        extrudedHeight: params.extrudedHeight,
        rotation: params.rotation,
        outline: params.outline ?? false,
        outlineColor: params.outlineColor ? parseColor(params.outlineColor) : void 0,
        fill: params.fill ?? true,
        stRotation: params.stRotation,
        numberOfVerticalLines: params.numberOfVerticalLines
      }
    });
  }
  function addRectangle(viewer, params) {
    return viewer.entities.add({
      name: params.name,
      rectangle: {
        coordinates: Cesium8.Rectangle.fromDegrees(params.west, params.south, params.east, params.north),
        material: resolveMaterial(params.material),
        height: params.height,
        extrudedHeight: params.extrudedHeight,
        rotation: params.rotation,
        outline: params.outline ?? false,
        outlineColor: params.outlineColor ? parseColor(params.outlineColor) : void 0,
        fill: params.fill ?? true,
        stRotation: params.stRotation
      }
    });
  }
  function addWall(viewer, params) {
    const posArray = params.positions.flatMap((p) => [p.longitude, p.latitude, p.height ?? 0]);
    return viewer.entities.add({
      name: params.name,
      wall: {
        positions: Cesium8.Cartesian3.fromDegreesArrayHeights(posArray),
        minimumHeights: params.minimumHeights,
        maximumHeights: params.maximumHeights,
        material: resolveMaterial(params.material),
        outline: params.outline ?? false,
        outlineColor: params.outlineColor ? parseColor(params.outlineColor) : void 0,
        fill: params.fill ?? true
      }
    });
  }

  // src/commands/animation.ts
  var Cesium9 = __toESM(require_cesium());
  var MODEL_PRESETS = {
    cesium_man: "https://raw.githubusercontent.com/CesiumGS/cesium/main/Apps/SampleData/models/CesiumMan/Cesium_Man.glb",
    cesium_air: "https://raw.githubusercontent.com/CesiumGS/cesium/main/Apps/SampleData/models/CesiumAir/Cesium_Air.glb",
    ground_vehicle: "https://raw.githubusercontent.com/CesiumGS/cesium/main/Apps/SampleData/models/GroundVehicle/GroundVehicle.glb",
    cesium_drone: "https://raw.githubusercontent.com/CesiumGS/cesium/main/Apps/SampleData/models/CesiumDrone/CesiumDrone.glb"
  };
  function resolveModelUri(uri) {
    if (!uri) return void 0;
    return MODEL_PRESETS[uri] ?? uri;
  }
  function createAnimation(viewer, params, animations) {
    const { waypoints, name, showPath = true, pathWidth = 2, pathColor = "#00FF00", pathLeadTime = 0, pathTrailTime = 1e10, multiplier = 1, shouldAnimate = true } = params;
    if (!waypoints || waypoints.length < 2) {
      throw new Error("Animation requires at least 2 waypoints");
    }
    const positionProperty = new Cesium9.SampledPositionProperty();
    for (const wp of waypoints) {
      const time = Cesium9.JulianDate.fromIso8601(wp.time);
      const position = Cesium9.Cartesian3.fromDegrees(wp.longitude, wp.latitude, wp.height ?? 0);
      positionProperty.addSample(time, position);
    }
    positionProperty.setInterpolationOptions({
      interpolationDegree: 2,
      // Cesium 1.143's declaration omits runtime fields from this namespace.
      interpolationAlgorithm: Cesium9.LagrangePolynomialApproximation
    });
    const modelUri = resolveModelUri(params.modelUri);
    const entity = viewer.entities.add({
      name,
      position: positionProperty,
      orientation: new Cesium9.VelocityOrientationProperty(positionProperty),
      model: modelUri ? {
        uri: modelUri,
        minimumPixelSize: 64,
        maximumScale: 200
      } : void 0,
      path: showPath ? new Cesium9.PathGraphics({
        width: pathWidth,
        material: new Cesium9.PolylineGlowMaterialProperty({
          glowPower: 0.1,
          color: parseColor(pathColor)
        }),
        leadTime: pathLeadTime,
        trailTime: pathTrailTime
      }) : void 0,
      point: !modelUri ? { pixelSize: 10, color: Cesium9.Color.RED } : void 0
    });
    const startTime = Cesium9.JulianDate.fromIso8601(waypoints[0].time);
    const stopTime = Cesium9.JulianDate.fromIso8601(waypoints[waypoints.length - 1].time);
    viewer.clock.startTime = startTime.clone();
    viewer.clock.stopTime = stopTime.clone();
    viewer.clock.currentTime = startTime.clone();
    viewer.clock.clockRange = Cesium9.ClockRange.LOOP_STOP;
    viewer.clock.multiplier = multiplier;
    viewer.clock.shouldAnimate = shouldAnimate;
    animations.set(entity.id, { startTime, stopTime });
    return entity;
  }
  function controlAnimation(viewer, action) {
    viewer.clock.shouldAnimate = action === "play";
  }
  function removeAnimation(viewer, entityId, animations) {
    const entity = viewer.entities.getById(entityId);
    if (!entity) return false;
    viewer.entities.remove(entity);
    animations.delete(entityId);
    return true;
  }
  function listAnimations(viewer, animations) {
    const result = [];
    for (const [entityId, info] of animations) {
      const entity = viewer.entities.getById(entityId);
      result.push({
        entityId,
        name: entity?.name,
        startTime: Cesium9.JulianDate.toIso8601(info.startTime),
        stopTime: Cesium9.JulianDate.toIso8601(info.stopTime),
        exists: !!entity
      });
    }
    return result;
  }
  function updateAnimationPath(viewer, params) {
    const entity = viewer.entities.getById(params.entityId);
    if (!entity?.path) return false;
    if (params.width !== void 0) entity.path.width = new Cesium9.ConstantProperty(params.width);
    if (params.color !== void 0) {
      entity.path.material = new Cesium9.PolylineGlowMaterialProperty({
        glowPower: 0.1,
        color: parseColor(params.color)
      });
    }
    if (params.leadTime !== void 0) entity.path.leadTime = new Cesium9.ConstantProperty(params.leadTime);
    if (params.trailTime !== void 0) entity.path.trailTime = new Cesium9.ConstantProperty(params.trailTime);
    if (params.show !== void 0) entity.path.show = new Cesium9.ConstantProperty(params.show);
    return true;
  }
  function trackEntity(viewer, params) {
    if (params.entityId) {
      const entity = viewer.entities.getById(params.entityId);
      if (!entity) throw new Error(`Entity not found: ${params.entityId}`);
      viewer.trackedEntity = entity;
      if (params.heading !== void 0 || params.pitch !== void 0 || params.range !== void 0) {
        const position = entity.position?.getValue(viewer.clock.currentTime);
        if (position) {
          const hpr = new Cesium9.HeadingPitchRange(
            Cesium9.Math.toRadians(params.heading ?? 0),
            Cesium9.Math.toRadians(params.pitch ?? -30),
            params.range ?? 500
          );
          viewer.camera.lookAt(position, hpr);
        }
      }
    } else {
      viewer.trackedEntity = void 0;
    }
  }
  function controlClock(viewer, params) {
    switch (params.action) {
      case "configure":
        if (params.startTime) viewer.clock.startTime = Cesium9.JulianDate.fromIso8601(params.startTime);
        if (params.stopTime) viewer.clock.stopTime = Cesium9.JulianDate.fromIso8601(params.stopTime);
        if (params.currentTime) viewer.clock.currentTime = Cesium9.JulianDate.fromIso8601(params.currentTime);
        if (params.multiplier !== void 0) viewer.clock.multiplier = params.multiplier;
        if (params.shouldAnimate !== void 0) viewer.clock.shouldAnimate = params.shouldAnimate;
        if (params.clockRange) viewer.clock.clockRange = Cesium9.ClockRange[params.clockRange];
        break;
      case "setTime":
        if (params.time) viewer.clock.currentTime = Cesium9.JulianDate.fromIso8601(params.time);
        break;
      case "setMultiplier":
        if (params.multiplier !== void 0) viewer.clock.multiplier = params.multiplier;
        break;
    }
  }
  function setGlobeLighting(viewer, params) {
    if (params.enableLighting !== void 0) {
      viewer.scene.globe.enableLighting = params.enableLighting;
    }
    if (params.dynamicAtmosphereLighting !== void 0) {
      viewer.scene.globe.dynamicAtmosphereLighting = params.dynamicAtmosphereLighting;
    }
    if (params.dynamicAtmosphereLightingFromSun !== void 0) {
      viewer.scene.globe.dynamicAtmosphereLightingFromSun = params.dynamicAtmosphereLightingFromSun;
    }
  }

  // src/commands/scene.ts
  var Cesium10 = __toESM(require_cesium());
  function setSceneOptions(viewer, params) {
    const { scene } = viewer;
    if (params.fogEnabled !== void 0) scene.fog.enabled = params.fogEnabled;
    if (params.fogDensity !== void 0) scene.fog.density = params.fogDensity;
    if (params.fogMinimumBrightness !== void 0) scene.fog.minimumBrightness = params.fogMinimumBrightness;
    if (scene.skyAtmosphere) {
      if (params.skyAtmosphereShow !== void 0) scene.skyAtmosphere.show = params.skyAtmosphereShow;
      if (params.skyAtmosphereHueShift !== void 0) scene.skyAtmosphere.hueShift = params.skyAtmosphereHueShift;
      if (params.skyAtmosphereSaturationShift !== void 0) scene.skyAtmosphere.saturationShift = params.skyAtmosphereSaturationShift;
      if (params.skyAtmosphereBrightnessShift !== void 0) scene.skyAtmosphere.brightnessShift = params.skyAtmosphereBrightnessShift;
    }
    if (params.groundAtmosphereShow !== void 0) scene.globe.showGroundAtmosphere = params.groundAtmosphereShow;
    if (params.shadowsEnabled !== void 0) viewer.shadows = params.shadowsEnabled;
    if (params.shadowsSoftShadows !== void 0) scene.shadowMap.softShadows = params.shadowsSoftShadows;
    if (params.shadowsDarkness !== void 0) scene.shadowMap.darkness = params.shadowsDarkness;
    if (scene.sun && params.sunShow !== void 0) scene.sun.show = params.sunShow;
    if (scene.sun && params.sunGlowFactor !== void 0) scene.sun.glowFactor = params.sunGlowFactor;
    if (scene.moon && params.moonShow !== void 0) scene.moon.show = params.moonShow;
    if (params.depthTestAgainstTerrain !== void 0) scene.globe.depthTestAgainstTerrain = params.depthTestAgainstTerrain;
    if (params.backgroundColor !== void 0) scene.backgroundColor = parseColor(params.backgroundColor);
  }
  function setPostProcess(viewer, params) {
    const stages = viewer.scene.postProcessStages;
    if (params.bloom !== void 0) stages.bloom.enabled = params.bloom;
    if (params.bloom || stages.bloom.enabled) {
      const bloom = stages.bloom;
      if (params.bloomContrast !== void 0) bloom.uniforms.contrast = params.bloomContrast;
      if (params.bloomBrightness !== void 0) bloom.uniforms.brightness = params.bloomBrightness;
      if (params.bloomDelta !== void 0) bloom.uniforms.delta = params.bloomDelta;
      if (params.bloomSigma !== void 0) bloom.uniforms.sigma = params.bloomSigma;
      if (params.bloomStepSize !== void 0) bloom.uniforms.stepSize = params.bloomStepSize;
      if (params.bloomGlowOnly !== void 0) bloom.uniforms.glowOnly = params.bloomGlowOnly;
    }
    if (params.ambientOcclusion !== void 0) stages.ambientOcclusion.enabled = params.ambientOcclusion;
    if (params.ambientOcclusion || stages.ambientOcclusion.enabled) {
      const ao = stages.ambientOcclusion;
      if (params.aoIntensity !== void 0) ao.uniforms.intensity = params.aoIntensity;
      if (params.aoBias !== void 0) ao.uniforms.bias = params.aoBias;
      if (params.aoLengthCap !== void 0) ao.uniforms.lengthCap = params.aoLengthCap;
      if (params.aoStepSize !== void 0) ao.uniforms.stepSize = params.aoStepSize;
    }
    if (params.fxaa !== void 0) stages.fxaa.enabled = params.fxaa;
  }
  var EDGE_MODE_MAP = {
    surfaces_only: Cesium10.EdgeDisplayMode.SURFACES_ONLY,
    surfaces_and_edges: Cesium10.EdgeDisplayMode.SURFACES_AND_EDGES,
    edges_only: Cesium10.EdgeDisplayMode.EDGES_ONLY
  };
  function setEdgeDisplayMode(viewer, layerManager, params) {
    const mode = EDGE_MODE_MAP[params.mode];
    if (mode === void 0) {
      throw new Error(`Invalid edge display mode: ${params.mode}`);
    }
    let applied = 0;
    if (params.tilesetId) {
      const refs = layerManager.getCesiumRefs(params.tilesetId);
      if (refs?.tileset) {
        refs.tileset.edgeDisplayMode = mode;
        applied = 1;
      }
    } else {
      const primitives = viewer.scene.primitives;
      for (let i = 0; i < primitives.length; i++) {
        const p = primitives.get(i);
        if (p instanceof Cesium10.Cesium3DTileset) {
          p.edgeDisplayMode = mode;
          applied++;
        }
      }
    }
    return { applied };
  }

  // src/bridge.ts
  var CesiumBridge = class {
    constructor(viewer) {
      this._eventHandlers = /* @__PURE__ */ new Map();
      this._orbitHandler = null;
      this._animations = /* @__PURE__ */ new Map();
      // ==================== Trajectory ====================
      this._activeTrajectories = /* @__PURE__ */ new Map();
      this._viewer = viewer;
      this._layerManager = new LayerManager(viewer);
    }
    get viewer() {
      return this._viewer;
    }
    get layerManager() {
      return this._layerManager;
    }
    // ==================== 命令分发（MCP/SSE 兼容） ====================
    async execute(cmd) {
      try {
        const p = cmd.params;
        switch (cmd.action) {
          case "flyTo":
            await this.flyTo(p);
            return { success: true, message: "Camera flew to target position" };
          case "setView":
            this.setView(p);
            return { success: true, message: "Camera view set" };
          case "getView":
            return { success: true, data: this.getView(), message: "Current view state retrieved" };
          case "zoomToExtent":
            await this.zoomToExtent(p);
            return { success: true, message: "Zoomed to extent" };
          case "addGeoJsonLayer": {
            const info = await this.addGeoJsonLayer(p);
            return { success: true, data: info, message: `GeoJSON layer '${info.name}' added` };
          }
          case "addGeoJsonPrimitive": {
            const info = await this.addGeoJsonPrimitive(p);
            return { success: true, data: info, message: `GeoJSON primitive '${info.name}' added` };
          }
          case "addHeatmap": {
            const info = await this.addHeatmap(p);
            return { success: true, data: info, message: `Heatmap '${info.name}' added` };
          }
          case "addLabel": {
            const count = this.addLabel(p);
            return { success: true, data: { labelCount: count }, message: `${count} labels added` };
          }
          case "addMarker": {
            const entity = this.addMarker(p);
            return { success: true, data: { entityId: entity.id }, message: "Marker added" };
          }
          case "addPolyline": {
            const entity = this.addPolyline(p);
            return { success: true, data: { entityId: entity.id }, message: "Polyline added" };
          }
          case "addPolygon": {
            const entity = this.addPolygon(p);
            return { success: true, data: { entityId: entity.id }, message: "Polygon added" };
          }
          case "addModel": {
            const entity = this.addModel(p);
            return { success: true, data: { entityId: entity.id }, message: "Model added" };
          }
          case "updateEntity": {
            const ok = this.updateEntity(p);
            return { success: ok, message: ok ? "Entity updated" : void 0, error: ok ? void 0 : `Entity not found: ${p.entityId}` };
          }
          case "removeEntity": {
            const ok = this.removeEntity(p.entityId);
            return { success: ok, message: ok ? "Entity removed" : void 0, error: ok ? void 0 : `Entity not found: ${p.entityId}` };
          }
          case "removeLayer":
            this.removeLayer(p.id);
            return { success: true, message: `Layer '${p.id}' removed` };
          case "clearAll": {
            const result = this.clearAll();
            return { success: true, data: result, message: `Cleared ${result.removedLayers} layers and ${result.removedEntities} entities` };
          }
          case "setBasemap": {
            const basemap = this.setBasemap(p);
            return { success: true, data: { basemap }, message: `Basemap set to '${basemap}'` };
          }
          case "setLayerVisibility":
            this.setLayerVisibility(p.id, p.visible);
            return { success: true, message: `Layer '${p.id}' visibility set to ${p.visible}` };
          case "updateLayerStyle": {
            const ok = this.updateLayerStyle(p);
            return { success: ok, message: ok ? "Layer style updated" : void 0, error: ok ? void 0 : `\u56FE\u5C42\u672A\u627E\u5230\u6216\u4E0D\u652F\u6301\u6837\u5F0F\u4FEE\u6539: ${p.layerId}` };
          }
          case "screenshot": {
            const result = await this.screenshot();
            return { success: true, data: result, message: "Screenshot captured" };
          }
          case "highlight":
            this.highlight(p);
            return { success: true, message: p.clear ? "Highlight cleared" : "Features highlighted" };
          case "measure": {
            const result = this.measure(p);
            return { success: true, data: result, message: `Measurement complete: ${result.value} ${result.unit}` };
          }
          case "load3dTiles": {
            const info = await this.load3dTiles(p);
            return { success: true, data: info, message: `3D Tiles '${info.name}' loaded` };
          }
          case "load3dGaussianSplat": {
            const info = await this.load3dGaussianSplat(p);
            return { success: true, data: info, message: `3D Gaussian Splat '${info.name}' loaded` };
          }
          case "loadTerrain":
            this.loadTerrain(p);
            return { success: true, message: "Terrain provider updated" };
          case "loadImageryService": {
            const info = await this.loadImageryService(p);
            return { success: true, data: info, message: `Imagery service '${info.name}' loaded` };
          }
          case "loadCzml": {
            const info = await this.loadCzml(p);
            return { success: true, data: info, message: `CZML data source '${info.name}' loaded` };
          }
          case "loadKml": {
            const info = await this.loadKml(p);
            return { success: true, data: info, message: `KML data source '${info.name}' loaded` };
          }
          case "playTrajectory": {
            const result = this.playTrajectory(p);
            return { success: true, data: { entityId: result.entityId }, message: "Trajectory playback started" };
          }
          case "listLayers": {
            const layers = this.listLayers();
            return { success: true, data: { layers }, message: `${layers.length} layers found` };
          }
          case "getLayerSchema": {
            const result = this.getLayerSchema(p);
            return { success: true, data: result, message: `Layer '${result.layerName}' has ${result.fields.length} fields, ${result.entityCount} entities` };
          }
          // ==================== Camera (融合官方) ====================
          case "lookAtTransform":
            this.lookAtTransform(p);
            return { success: true, message: "Camera lookAtTransform applied" };
          case "startOrbit":
            this.startOrbit(p);
            return { success: true, message: "Orbit started" };
          case "stopOrbit":
            this.stopOrbit();
            return { success: true, message: "Orbit stopped" };
          case "setCameraOptions":
            this.setCameraOptions(p);
            return { success: true, message: "Camera options updated" };
          // ==================== Entity Types (融合官方) ====================
          case "addBillboard": {
            const entity = this.addBillboard(p);
            return { success: true, data: { entityId: entity.id }, message: "Billboard added" };
          }
          case "addBox": {
            const entity = this.addBox(p);
            return { success: true, data: { entityId: entity.id }, message: "Box added" };
          }
          case "addCorridor": {
            const entity = this.addCorridor(p);
            return { success: true, data: { entityId: entity.id }, message: "Corridor added" };
          }
          case "addCylinder": {
            const entity = this.addCylinder(p);
            return { success: true, data: { entityId: entity.id }, message: "Cylinder added" };
          }
          case "addEllipse": {
            const entity = this.addEllipse(p);
            return { success: true, data: { entityId: entity.id }, message: "Ellipse added" };
          }
          case "addRectangle": {
            const entity = this.addRectangle(p);
            return { success: true, data: { entityId: entity.id }, message: "Rectangle added" };
          }
          case "addWall": {
            const entity = this.addWall(p);
            return { success: true, data: { entityId: entity.id }, message: "Wall added" };
          }
          // ==================== Animation (融合官方) ====================
          case "createAnimation": {
            const entity = this.createAnimation(p);
            return { success: true, data: { entityId: entity.id }, message: "Animation created" };
          }
          case "controlAnimation":
            this.controlAnimation(p.action);
            return { success: true, message: `Animation ${p.action}` };
          case "removeAnimation": {
            const ok = this.removeAnimation(p.entityId);
            return { success: ok, message: ok ? "Animation removed" : void 0, error: ok ? void 0 : `Animation entity not found: ${p.entityId}` };
          }
          case "listAnimations": {
            const animations = this.listAnimations();
            return { success: true, data: { animations }, message: `${animations.length} animations found` };
          }
          case "updateAnimationPath": {
            const ok = this.updateAnimationPath(p);
            return { success: ok, message: ok ? "Animation path updated" : void 0, error: ok ? void 0 : "Entity or path not found" };
          }
          case "trackEntity":
            this.trackEntity(p);
            return { success: true, message: p.entityId ? `Tracking entity ${p.entityId}` : "Tracking stopped" };
          case "controlClock":
            this.controlClock(p);
            return { success: true, message: `Clock ${p.action} applied` };
          case "setGlobeLighting":
            this.setGlobeLighting(p);
            return { success: true, message: "Globe lighting updated" };
          // ==================== Scene & Post-Processing ====================
          case "setSceneOptions":
            this.setSceneOptions(p);
            return { success: true, message: "Scene options updated" };
          case "setPostProcess":
            this.setPostProcess(p);
            return { success: true, message: "Post-processing effects updated" };
          case "setEdgeDisplayMode": {
            const result = this.setEdgeDisplayMode(p);
            return { success: true, data: result, message: `Edge display mode set on ${result.applied} tileset(s)` };
          }
          case "setIonToken":
            Cesium11.Ion.defaultAccessToken = p.token;
            return { success: true, message: "Cesium Ion access token updated" };
          // ==================== Batch & Query ====================
          case "batchAddEntities": {
            const result = this.batchAddEntities(p);
            return { success: true, data: result, message: `${result.entityIds.length} entities added` };
          }
          case "queryEntities": {
            const entities = this.queryEntities(p);
            return { success: true, data: { entities }, message: `${entities.length} entities found` };
          }
          case "getEntityProperties": {
            const result = this.getEntityProperties(p);
            return { success: true, data: result, message: `Properties for entity '${result.entityId}'` };
          }
          // ==================== Viewpoint Bookmarks ====================
          case "saveViewpoint": {
            const state = this.saveViewpoint(p);
            return { success: true, data: state, message: `Viewpoint '${p.name}' saved` };
          }
          case "loadViewpoint": {
            const state = this.loadViewpoint(p);
            if (!state) return { success: false, error: `Viewpoint '${p.name}' not found` };
            return { success: true, data: state, message: `Viewpoint '${p.name}' loaded` };
          }
          case "listViewpoints": {
            const viewpoints = this.listViewpoints();
            return { success: true, data: { viewpoints }, message: `${viewpoints.length} viewpoints saved` };
          }
          case "exportScene": {
            const result = this.exportScene();
            return { success: true, data: result, message: "Scene exported" };
          }
          default:
            return { success: false, error: `\u672A\u77E5\u6307\u4EE4: ${cmd.action}` };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, error: msg };
      }
    }
    // ==================== View ====================
    flyTo(params) {
      return flyTo(this._viewer, params);
    }
    setView(params) {
      setView(this._viewer, params);
    }
    getView() {
      return getView(this._viewer);
    }
    zoomToExtent(params) {
      return zoomToExtent(this._viewer, params);
    }
    // ==================== Layer ====================
    addGeoJsonLayer(params) {
      return this._layerManager.addGeoJsonLayer(params);
    }
    addGeoJsonPrimitive(params) {
      return this._layerManager.addGeoJsonPrimitive(params);
    }
    addHeatmap(params) {
      return this._layerManager.addHeatmap(params);
    }
    removeLayer(id) {
      this._layerManager.removeLayer(id);
      this._emit("layerRemoved", { id });
    }
    clearAll() {
      for (const [, t] of this._activeTrajectories) {
        t.stop();
      }
      this._activeTrajectories.clear();
      if (this._orbitHandler) {
        stopOrbit(this._orbitHandler);
        this._orbitHandler = null;
      }
      this._animations.clear();
      const result = this._layerManager.clearAll();
      this._emit("layerRemoved", { id: "*" });
      return result;
    }
    setLayerVisibility(id, visible) {
      this._layerManager.setLayerVisibility(id, visible);
    }
    toggleLayer(id) {
      this._layerManager.toggleLayer(id);
    }
    zoomToLayer(id) {
      this._layerManager.zoomToLayer(id);
    }
    updateLayerStyle(params) {
      return this._layerManager.updateLayerStyle(params);
    }
    listLayers() {
      return this._layerManager.listLayers();
    }
    getLayerSchema(params) {
      return this._layerManager.getLayerSchema(params);
    }
    setBasemap(params) {
      return this._layerManager.setBasemap(params);
    }
    // ==================== 3D Scene ====================
    load3dTiles(params) {
      return this._layerManager.load3dTiles(params);
    }
    load3dGaussianSplat(params) {
      return this._layerManager.addGaussianSplat(params);
    }
    loadTerrain(params) {
      this._layerManager.loadTerrain(params);
    }
    loadImageryService(params) {
      return this._layerManager.loadImageryService(params);
    }
    loadCzml(params) {
      return this._layerManager.loadCzml(params);
    }
    loadKml(params) {
      return this._layerManager.loadKml(params);
    }
    playTrajectory(params) {
      const id = params.id ?? `trajectory_${Date.now()}`;
      const existing = this._activeTrajectories.get(id);
      if (existing) existing.stop();
      const result = playTrajectory(this._viewer, { ...params, id });
      this._activeTrajectories.set(id, { stop: result.stop, pause: result.pause, resume: result.resume, isPlaying: result.isPlaying });
      const layerId = `trajectory_${id}`;
      const info = {
        id: layerId,
        name: params.name ?? `\u8F68\u8FF9 - ${id}`,
        type: "\u8F68\u8FF9",
        visible: true,
        color: "#F59E0B"
      };
      this._layerManager.setCesiumRefs(layerId, {
        movingEntity: result.movingEntity,
        trailEntity: result.trailEntity,
        trajectoryId: id
      });
      this._layerManager.layers.push(info);
      this._emit("layerAdded", info);
      return result;
    }
    stopTrajectory(id) {
      const t = this._activeTrajectories.get(id);
      if (t) {
        t.stop();
        this._activeTrajectories.delete(id);
      }
    }
    pauseTrajectory(id) {
      this._activeTrajectories.get(id)?.pause();
    }
    resumeTrajectory(id) {
      this._activeTrajectories.get(id)?.resume();
    }
    toggleTrajectory(id) {
      const t = this._activeTrajectories.get(id);
      if (!t) return false;
      if (t.isPlaying()) {
        t.pause();
      } else {
        t.resume();
      }
      return t.isPlaying();
    }
    isTrajectoryPlaying(id) {
      return this._activeTrajectories.get(id)?.isPlaying() ?? false;
    }
    // ==================== Entity ====================
    addLabel(params) {
      const data = params.data;
      if (!data) return 0;
      if (params.dataRefId) {
        const existingRefs = this._layerManager.getCesiumRefs(params.dataRefId);
        if (existingRefs?.dataSource) {
          return this._attachLabelsToDataSource(existingRefs.dataSource, params);
        }
      }
      const entities = addLabels(this._viewer, data, params);
      const layerId = params.dataRefId ? `label_${params.dataRefId}` : `label_${Date.now()}`;
      const info = {
        id: layerId,
        name: `\u6807\u6CE8 - ${params.field}`,
        type: "\u6807\u6CE8",
        visible: true,
        color: params.style?.fillColor ?? "#FFFFFF"
      };
      this._layerManager.setCesiumRefs(layerId, { labelEntities: entities });
      this._layerManager.layers.push(info);
      this._emit("layerAdded", info);
      return entities.length;
    }
    /** 将标注附加到现有 GeoJsonDataSource 的实体上（圆点+文字同图层） */
    _attachLabelsToDataSource(ds, params) {
      const { field, style } = params;
      const font = style?.font ?? "12px sans-serif";
      const fillColor = style?.fillColor ? Cesium11.Color.fromCssColorString(style.fillColor) : Cesium11.Color.WHITE;
      const outlineColor = style?.outlineColor ? Cesium11.Color.fromCssColorString(style.outlineColor) : Cesium11.Color.BLACK;
      const outlineWidth = style?.outlineWidth ?? 2;
      const pixelOffset = style?.pixelOffset ? new Cesium11.Cartesian2(style.pixelOffset[0], style.pixelOffset[1]) : new Cesium11.Cartesian2(0, -16);
      let count = 0;
      const entities = ds.entities.values;
      for (let i = 0; i < entities.length; i++) {
        const e = entities[i];
        if (!e.properties || !e.position) continue;
        const val = e.properties[field]?.getValue(Cesium11.JulianDate.now());
        if (val == null || val === "") continue;
        e.label = new Cesium11.LabelGraphics({
          text: String(val),
          font,
          fillColor,
          outlineColor,
          outlineWidth,
          style: Cesium11.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset,
          scale: style?.scale ?? 1,
          verticalOrigin: Cesium11.VerticalOrigin.BOTTOM,
          heightReference: Cesium11.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        });
        count++;
      }
      return count;
    }
    addMarker(params) {
      const entity = addMarker(this._viewer, params);
      const layerId = `marker_${entity.id}`;
      const info = {
        id: layerId,
        name: params.label ?? layerId,
        type: "\u6807\u6CE8\u70B9",
        visible: true,
        color: typeof params.color === "string" ? params.color : "#3B82F6"
      };
      this._layerManager.setCesiumRefs(layerId, { entity });
      this._layerManager.layers.push(info);
      this._emit("layerAdded", info);
      return entity;
    }
    addPolyline(params) {
      const entity = addPolyline(this._viewer, params);
      const layerId = `polyline_${entity.id}`;
      const info = {
        id: layerId,
        name: params.label ?? layerId,
        type: "\u6298\u7EBF",
        visible: true,
        color: typeof params.color === "string" ? params.color : "#3B82F6"
      };
      this._layerManager.setCesiumRefs(layerId, { entity });
      this._layerManager.layers.push(info);
      this._emit("layerAdded", info);
      return entity;
    }
    addPolygon(params) {
      const entity = addPolygon(this._viewer, params);
      const layerId = `polygon_${entity.id}`;
      const info = {
        id: layerId,
        name: params.label ?? layerId,
        type: "\u591A\u8FB9\u5F62",
        visible: true,
        color: typeof params.color === "string" ? params.color : "#3B82F6"
      };
      this._layerManager.setCesiumRefs(layerId, { entity });
      this._layerManager.layers.push(info);
      this._emit("layerAdded", info);
      return entity;
    }
    addModel(params) {
      const entity = addModel(this._viewer, params);
      const layerId = `model_${entity.id}`;
      const info = {
        id: layerId,
        name: params.label ?? layerId,
        type: "\u6A21\u578B",
        visible: true,
        color: "#8B5CF6"
      };
      this._layerManager.setCesiumRefs(layerId, { entity });
      this._layerManager.layers.push(info);
      this._emit("layerAdded", info);
      return entity;
    }
    updateEntity(params) {
      return updateEntity(this._viewer, params);
    }
    removeEntity(entityId) {
      const entity = this._viewer.entities.getById(entityId);
      if (!entity) return false;
      const ok = removeEntity(this._viewer, entityId);
      if (ok) {
        const layerId = this._layerManager.untrackByEntity(entity);
        if (layerId) this._emit("layerRemoved", { id: layerId });
      }
      return ok;
    }
    getEntityProperties(params) {
      return getEntityProperties(this._viewer, params);
    }
    // ==================== Interaction ====================
    screenshot() {
      return screenshot(this._viewer);
    }
    highlight(params) {
      highlight(this._viewer, this._layerManager, params);
    }
    measure(params) {
      return measure(this._viewer, params);
    }
    // ==================== Camera (融合官方 Camera Server) ====================
    lookAtTransform(params) {
      lookAtTransform(this._viewer, params);
    }
    startOrbit(params) {
      this._orbitHandler = startOrbit(this._viewer, params, this._orbitHandler ?? void 0);
    }
    stopOrbit() {
      stopOrbit(this._orbitHandler ?? void 0);
      this._orbitHandler = null;
    }
    setCameraOptions(params) {
      setCameraOptions(this._viewer, params);
    }
    // ==================== Entity Types (融合官方 Entity Server) ====================
    _registerEntityLayer(entity, type, name, color) {
      const layerId = `${type}_${entity.id}`;
      const info = {
        id: layerId,
        name: name ?? entity.name ?? layerId,
        type,
        visible: true,
        color: color ?? "#3B82F6"
      };
      this._layerManager.setCesiumRefs(layerId, { entity });
      this._layerManager.layers.push(info);
      this._emit("layerAdded", info);
      return entity;
    }
    addBillboard(params) {
      return this._registerEntityLayer(addBillboard(this._viewer, params), "billboard", params.name);
    }
    addBox(params) {
      return this._registerEntityLayer(addBox(this._viewer, params), "box", params.name);
    }
    addCorridor(params) {
      return this._registerEntityLayer(addCorridor(this._viewer, params), "corridor", params.name);
    }
    addCylinder(params) {
      return this._registerEntityLayer(addCylinder(this._viewer, params), "cylinder", params.name);
    }
    addEllipse(params) {
      return this._registerEntityLayer(addEllipse(this._viewer, params), "ellipse", params.name);
    }
    addRectangle(params) {
      return this._registerEntityLayer(addRectangle(this._viewer, params), "rectangle", params.name);
    }
    addWall(params) {
      return this._registerEntityLayer(addWall(this._viewer, params), "wall", params.name);
    }
    // ==================== Animation (融合官方 Animation Server) ====================
    createAnimation(params) {
      const entity = createAnimation(this._viewer, params, this._animations);
      const layerId = `animation_${entity.id}`;
      const info = {
        id: layerId,
        name: params.name ?? `Animation - ${entity.id}`,
        type: "animation",
        visible: true,
        color: params.pathColor ?? "#00FF00"
      };
      this._layerManager.setCesiumRefs(layerId, { entity });
      this._layerManager.layers.push(info);
      this._emit("layerAdded", info);
      return entity;
    }
    controlAnimation(action) {
      controlAnimation(this._viewer, action);
    }
    removeAnimation(entityId) {
      const ok = removeAnimation(this._viewer, entityId, this._animations);
      if (ok) {
        const layerId = `animation_${entityId}`;
        const idx = this._layerManager.layers.findIndex((l) => l.id === layerId);
        if (idx >= 0) this._layerManager.layers.splice(idx, 1);
        this._emit("layerRemoved", { id: layerId });
      }
      return ok;
    }
    listAnimations() {
      return listAnimations(this._viewer, this._animations);
    }
    updateAnimationPath(params) {
      return updateAnimationPath(this._viewer, params);
    }
    trackEntity(params) {
      trackEntity(this._viewer, params);
    }
    controlClock(params) {
      controlClock(this._viewer, params);
    }
    setGlobeLighting(params) {
      setGlobeLighting(this._viewer, params);
    }
    // ==================== Scene & Post-Processing ====================
    setSceneOptions(params) {
      setSceneOptions(this._viewer, params);
    }
    setPostProcess(params) {
      setPostProcess(this._viewer, params);
    }
    setEdgeDisplayMode(params) {
      return setEdgeDisplayMode(this._viewer, this._layerManager, params);
    }
    // ==================== Batch & Query ====================
    batchAddEntities(params) {
      return batchAddEntities(this._viewer, params.entities, {
        addMarker: (p) => this.addMarker(p),
        addPolyline: (p) => this.addPolyline(p),
        addPolygon: (p) => this.addPolygon(p),
        addModel: (p) => this.addModel(p),
        addBillboard: (p) => this.addBillboard(p),
        addBox: (p) => this.addBox(p),
        addCylinder: (p) => this.addCylinder(p),
        addEllipse: (p) => this.addEllipse(p),
        addRectangle: (p) => this.addRectangle(p),
        addWall: (p) => this.addWall(p),
        addCorridor: (p) => this.addCorridor(p)
      });
    }
    queryEntities(params) {
      return queryEntities(this._viewer, params);
    }
    // ==================== Viewpoint Bookmarks ====================
    saveViewpoint(params) {
      return saveViewpoint(this._viewer, params);
    }
    loadViewpoint(params) {
      return loadViewpoint(this._viewer, params);
    }
    listViewpoints() {
      return listViewpoints();
    }
    exportScene() {
      return {
        view: this.getView(),
        layers: this.listLayers(),
        entities: this.queryEntities({}),
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      };
    }
    // ==================== Events ====================
    on(event, handler) {
      if (!this._eventHandlers.has(event)) {
        this._eventHandlers.set(event, /* @__PURE__ */ new Set());
      }
      this._eventHandlers.get(event).add(handler);
      return () => {
        this._eventHandlers.get(event)?.delete(handler);
      };
    }
    _emit(event, data) {
      this._eventHandlers.get(event)?.forEach((fn) => fn({ type: event, data }));
    }
  };

  // src/webmcp.ts
  function resolveModelContext(options) {
    if (options.modelContext) return options.modelContext;
    const documentRef = options.document ?? (typeof document === "undefined" ? void 0 : document);
    if (!documentRef?.modelContext) {
      throw new Error("WebMCP is not available: document.modelContext is undefined");
    }
    return documentRef.modelContext;
  }
  function assertUniqueToolNames(tools) {
    const names = /* @__PURE__ */ new Set();
    for (const tool of tools) {
      if (names.has(tool.name)) throw new Error(`Duplicate WebMCP tool name: ${tool.name}`);
      names.add(tool.name);
    }
  }
  async function registerWebMcpTools(bridge, tools, options = {}) {
    assertUniqueToolNames(tools);
    const modelContext = resolveModelContext(options);
    const controller = new AbortController();
    const unregister = () => controller.abort();
    if (options.signal) {
      if (options.signal.aborted) controller.abort();
      else options.signal.addEventListener("abort", unregister, { once: true });
    }
    const registered = [];
    try {
      for (const tool of tools) {
        const annotations = tool.annotations ? {
          ...annotationsValue(tool.annotations.readOnlyHint, "readOnlyHint"),
          ...annotationsValue(tool.annotations.untrustedContentHint, "untrustedContentHint")
        } : void 0;
        await modelContext.registerTool({
          name: tool.name,
          title: tool.title ?? tool.annotations?.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: annotations && Object.keys(annotations).length > 0 ? annotations : void 0,
          execute: (input) => bridge.execute({ action: tool.name, params: input })
        }, {
          signal: controller.signal,
          ...options.exposedTo ? { exposedTo: options.exposedTo } : {}
        });
        registered.push(tool.name);
      }
    } catch (error) {
      unregister();
      throw error;
    }
    return { registered, signal: controller.signal, unregister };
  }
  function annotationsValue(value, key) {
    return value === void 0 ? {} : { [key]: value };
  }

  exports.CesiumBridge = CesiumBridge;
  exports.LayerManager = LayerManager;
  exports.registerWebMcpTools = registerWebMcpTools;

  return exports;

})({});
