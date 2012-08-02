// FIXME handle rotation
// FIXME probably need to abstract out a "layers listener"
// FIXME handle layer order

goog.provide('ol.view.Attribution');

goog.require('goog.dom');
goog.require('goog.dom.TagName');
goog.require('goog.events');
goog.require('goog.events.EventType');
goog.require('goog.object');
goog.require('goog.style');
goog.require('ol.Collection');
goog.require('ol.CoverageArea');
goog.require('ol.Layer');
goog.require('ol.MapProperty');
goog.require('ol.View');



/**
 * @constructor
 * @extends {ol.View}
 * @param {ol.Map} map Map.
 */
ol.view.Attribution = function(map) {

  goog.base(this, map);

  /**
   * @private
   * @type {Element}
   */
  this.ulElement_ = goog.dom.createElement(goog.dom.TagName.UL);

  /**
   * @private
   * @type {Array.<number>}
   */
  this.layersListenerKeys_ = null;

  /**
   * @private
   * @type {Object.<number, ?number>}
   */
  this.layerVisibleChangeListenerKeys_ = {};

  /**
   * @private
   * @type {Object.<number, Element>}
   */
  this.attributionElements_ = {};

  /**
   * @private
   * @type {Object.<number, Array.<ol.CoverageArea>>}
   */
  this.coverageAreass_ = {};

  goog.events.listen(map, ol.Object.getChangedEventType(ol.MapProperty.CENTER),
      this.handleMapChanged, false, this);

  goog.events.listen(map, ol.Object.getChangedEventType(ol.MapProperty.LAYERS),
      this.handleMapLayersChanged, false, this);

  goog.events.listen(map,
      ol.Object.getChangedEventType(ol.MapProperty.RESOLUTION),
      this.handleMapChanged, false, this);

  goog.events.listen(map, ol.Object.getChangedEventType(ol.MapProperty.SIZE),
      this.handleMapChanged, false, this);

  this.handleMapLayersChanged();

};
goog.inherits(ol.view.Attribution, ol.View);


/**
 * @param {ol.Layer} layer Layer.
 * @private
 */
ol.view.Attribution.prototype.createAttributionElementsForLayer_ =
    function(layer) {

  var store = layer.getStore();
  var attributions = store.getAttributions();
  if (goog.isNull(attributions)) {
    return;
  }

  var map = this.getMap();
  var mapIsDef = map.isDef();
  var mapExtent = /** @type {ol.Extent} */ map.getExtent();
  var mapProjection = /** @type {ol.Projection} */ map.getProjection();
  var mapResolution = /** @type {number} */ map.getResolution();

  var layerVisible = layer.getVisible();

  var attributionVisibilities;
  if (mapIsDef && layerVisible) {
    attributionVisibilities = this.getLayerAttributionVisiblities_(
        layer, mapExtent, mapResolution, mapProjection);
  } else {
    attributionVisibilities = null;
  }

  goog.array.forEach(attributions, function(attribution) {

    var attributionKey = goog.getUid(attribution);

    var attributionElement = goog.dom.createElement(goog.dom.TagName.LI);
    attributionElement.innerHTML = attribution.getHtml();

    if (!map.isDef ||
        !layerVisible ||
        !attributionVisibilities[attributionKey]) {
      goog.style.showElement(attributionElement, false);
    }

    this.ulElement_.appendChild(attributionElement);

    this.attributionElements_[attributionKey] = attributionElement;

  }, this);

};


/**
 * @inheritDoc
 */
ol.view.Attribution.prototype.getElement = function() {
  return this.ulElement_;
};


/**
 * @param {ol.Layer} layer Layer.
 * @protected
 */
ol.view.Attribution.prototype.handleLayerAdd = function(layer) {

  var layerKey = goog.getUid(layer);

  this.layerVisibleChangeListenerKeys_[layerKey] = goog.events.listen(
      layer, ol.Object.getChangedEventType(ol.LayerProperty.VISIBLE),
      this.handleLayerVisibleChanged, false, this);

  if (layer.getStore().isReady()) {
    this.createAttributionElementsForLayer_(layer);
  } else {
    goog.events.listenOnce(layer, goog.events.EventType.LOAD,
        this.handleLayerLoad, false, this);
  }

};


/**
 * @param {goog.events.Event} event Event.
 */
ol.view.Attribution.prototype.handleLayerLoad = function(event) {
  var layer = /** @type {ol.Layer} */ event.target;
  this.createAttributionElementsForLayer_(layer);
};


/**
 * @param {ol.Layer} layer Layer.
 * @protected
 */
ol.view.Attribution.prototype.handleLayerRemove = function(layer) {

  var layerKey = goog.getUid(layer);

  goog.events.unlistenByKey(this.layerVisibleChangeListenerKeys_[layerKey]);
  delete this.layerVisibleChangeListenerKeys_[layerKey];

  goog.array.forEach(layer.getStore().getAttributions(), function(attribution) {
    var attributionKey = goog.getUid(attribution);
    delete this.coverageAreass_[attributionKey];
    var attributionElement = this.attributionElements_[attributionKey];
    this.ulElement_.removeChild(attributionElement);
    delete this.attributionElements_[attributionKey];
  }, this);

};


/**
 * @param {goog.events.Event} event Eveny.
 * @protected
 */
ol.view.Attribution.prototype.handleLayerVisibleChanged = function(event) {

  var map = this.getMap();
  var mapIsDef = map.isDef();
  var mapExtent = /** @type {ol.Extent} */ map.getExtent();
  var mapProjection = /** @type {ol.Projection} */ map.getProjection();
  var mapResolution = /** @type {number} */ map.getResolution();

  var layer = /** @type {ol.Layer} */ event.target;

  this.updateLayerAttributionsVisibility_(
      layer, mapIsDef, mapExtent, mapResolution, mapProjection);

};


/**
 * @param {ol.CollectionEvent} collectionEvent Collection event.
 * @protected
 */
ol.view.Attribution.prototype.handleLayersInsertAt = function(collectionEvent) {
  var layers = /** @type {ol.Collection} */ collectionEvent.target;
  var layer = /** @type {ol.Layer} */ layers.getAt(collectionEvent.index);
  this.handleLayerAdd(layer);
};


/**
 * @param {ol.CollectionEvent} collectionEvent Collection event.
 * @protected
 */
ol.view.Attribution.prototype.handleLayersRemoveAt = function(collectionEvent) {
  var layer = /** @type {ol.Layer} */ collectionEvent.prev;
  this.handleLayerRemove(layer);
};


/**
 * @param {ol.CollectionEvent} collectionEvent Collection event.
 * @protected
 */
ol.view.Attribution.prototype.handleLayersSetAt = function(collectionEvent) {
  var prevLayer = /** @type {ol.Layer} */ collectionEvent.prev;
  this.handleLayerRemove(prevLayer);
  var layers = /** @type {ol.Collection} */ collectionEvent.target;
  var layer = /** @type {ol.Layer} */ layers.getAt(collectionEvent.index);
  this.handleLayerAdd(layer);
};


/**
 * @protected
 */
ol.view.Attribution.prototype.handleMapChanged = function() {

  var map = this.getMap();
  var mapIsDef = map.isDef();
  var mapExtent = /** @type {ol.Extent} */ map.getExtent();
  var mapProjection = /** @type {ol.Projection} */ map.getProjection();
  var mapResolution = map.getResolution();

  var layers = map.getLayers();
  layers.forEach(function(layer) {
    this.updateLayerAttributionsVisibility_(
        layer, mapIsDef, mapExtent, mapResolution, mapProjection);
  }, this);

};


/**
 * @protected
 */
ol.view.Attribution.prototype.handleMapLayersChanged = function() {
  if (!goog.isNull(this.layersListenerKeys_)) {
    goog.array.forEach(this.layersListenerKeys_, goog.events.unlistenByKey);
    this.layersListenerKeys_ = null;
  }
  var map = this.getMap();
  var layers = map.getLayers();
  if (goog.isDefAndNotNull(layers)) {
    layers.forEach(this.handleLayerAdd, this);
    this.layersListenerKeys_ = [
      goog.events.listen(layers, ol.CollectionEventType.INSERT_AT,
          this.handleLayersInsertAt, false, this),
      goog.events.listen(layers, ol.CollectionEventType.REMOVE_AT,
          this.handleLayersRemoveAt, false, this),
      goog.events.listen(layers, ol.CollectionEventType.SET_AT,
          this.handleLayersSetAt, false, this)
    ];
  }
};


/**
 * @param {ol.Layer} layer Layer.
 * @param {ol.Extent} mapExtent Map extent.
 * @param {number} mapResolution Map resolution.
 * @param {ol.Projection} mapProjection Map projection.
 * @return {Object.<number, boolean>} Attribution visibilities.
 * @private
 */
ol.view.Attribution.prototype.getLayerAttributionVisiblities_ =
    function(layer, mapExtent, mapResolution, mapProjection) {

  var store = layer.getStore();
  var attributions = store.getAttributions();

  if (goog.isNull(attributions)) {
    return null;
  }

  var mapZ;
  if (store instanceof ol.TileStore) {
    var tileStore = /** @type {ol.TileStore} */ store;
    var tileGrid = tileStore.getTileGrid();
    mapZ = tileGrid.getZForResolution(mapResolution);
  }

  var attributionVisibilities = {};
  goog.array.forEach(attributions, function(attribution) {

    var attributionKey = goog.getUid(attribution);

    var attributionVisible = true;

    var coverageAreas;
    if (attributionKey in this.coverageAreass_) {
      coverageAreas = this.coverageAreass_[attributionKey];
    } else {
      var attributionProjection = attribution.getProjection();
      coverageAreas = attribution.getCoverageAreas();
      if (!goog.isNull(coverageAreas) &&
          !ol.Projection.equivalent(attributionProjection, mapProjection)) {
        var transformFn = ol.Projection.getTransform(
            attributionProjection, mapProjection);
        if (transformFn !== ol.Projection.cloneTransform) {
          coverageAreas = goog.array.map(coverageAreas, function(coverageArea) {
            return coverageArea.transform(transformFn);
          });
        }
      }
      this.coverageAreass_[attributionKey] = coverageAreas;
    }

    if (!goog.isNull(coverageAreas)) {
      if (store instanceof ol.TileStore) {
        attributionVisible = goog.array.some(
            coverageAreas,
            /**
             * @param {ol.TileCoverageArea} tileCoverageArea Tile coverage area.
             */
            function(tileCoverageArea) {
              goog.asserts.assert(
                  tileCoverageArea instanceof ol.TileCoverageArea);
              return tileCoverageArea.intersectsExtentAndZ(mapExtent, mapZ);
            });
      } else {
        attributionVisible = goog.array.some(
            coverageAreas,
            function(coverageArea) {
              return coverageArea.intersectsExtentAndResolution(
                  mapExtent, mapResolution);
            });
      }
    }

    attributionVisibilities[attributionKey] = attributionVisible;

  }, this);

  return attributionVisibilities;

};


/**
 * @param {ol.Layer} layer Layer.
 * @param {boolean} mapIsDef Map is defined.
 * @param {ol.Extent} mapExtent Map extent.
 * @param {number} mapResolution Map resolution.
 * @param {ol.Projection} mapProjection Map projection.
 * @private
 */
ol.view.Attribution.prototype.updateLayerAttributionsVisibility_ =
    function(layer, mapIsDef, mapExtent, mapResolution, mapProjection) {
  if (mapIsDef && layer.getVisible()) {
    var attributionVisibilities = this.getLayerAttributionVisiblities_(
        layer, mapExtent, mapResolution, mapProjection);
    goog.object.forEach(
        attributionVisibilities,
        function(attributionVisible, attributionKey) {
          var attributionElement = this.attributionElements_[attributionKey];
          goog.style.showElement(attributionElement, attributionVisible);
        },
        this);
  } else {
    var store = layer.getStore();
    var attributions = store.getAttributions();
    if (!goog.isNull(attributions)) {
      goog.array.forEach(attributions, function(attribution) {
        var attributionKey = goog.getUid(attribution);
        var attributionElement = this.attributionElements_[attributionKey];
        goog.style.showElement(attributionElement, false);
      }, this);
    }
  }
};
