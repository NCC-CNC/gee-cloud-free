/*
================================================================================
Dan Wismer, Data Specialist IT, NCC

DESCRIPTION:
Generates the clearest, analysis-ready 
Sentinel-2 composite for a specified area, month, and year. It masks cloudy 
pixels using the Cloud Score+ (cs_cdf) band and scales reflectance bands 
to 0–1. Two spectral indices are computed:

1. Enhanced Vegetation Index (EVI) – highlights vegetation health.
2. Burn Area Index (BAI) – highlights potential burned areas.
3. Normalized Burn Ratio (NBR) – highlights areas of vegetation loss, burned areas, or canopy disturbance.

A pixel-wise quality mosaic ensures that the clearest pixel is selected at 
each location. The final composite is clipped to the AOI and can be 
visualized in True Color or using scaled indices with a continuous color 
palette.

Links:
https://medium.com/google-earth/all-clear-with-cloud-score-bd6ee2e2235e
https://code.earthengine.google.com/f13d26191db4a639731012df6412f561
https://developers.google.com/earth-engine/datasets/catalog/GOOGLE_CLOUD_SCORE_PLUS_V1_S2_HARMONIZED#:~:text=The%20cs%20band%20scores%20QA,a%20given%20location%20through%20time.
================================================================================
*/

// 1. Define AOI with buffer: Darkwoods and Next Creek
var darkwoods_nextcreek = ee
  .FeatureCollection(
    "projects/canvas-setup-437317-u8/assets/darkwoods_nextcreek"
  )
  .map(function (f) {
    return f.buffer(1000);
  });

// 2. Spectral Indicies Functions
// Enhanced Vegetation Index (EVI)
function calculateEVI(image) {
  // EVI = 2.5 * ((NIR - RED) / (NIR + 6*RED - 7.5*BLUE + 1))
  var evi = image
    .expression("2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))", {
      NIR: image.select("B8"),
      RED: image.select("B4"),
      BLUE: image.select("B2"),
    })
    .rename("evi");
  return image.addBands(evi);
}

// Burn Area Index (BAI)
function calculateBAI(image) {
  // BAI = 1 / ((0.1 - RED)^2 + (0.06 - NIR)^2)
  var bai = image
    .expression("1 / ((0.1 - RED)**2 + (0.06 - NIR)**2)", {
      RED: image.select("B4"),
      NIR: image.select("B8"),
    })
    .rename("bai");
  return image.addBands(bai);
}

// Normalized Burn Ratio (NBR)
function calculateNBR(image) {
  // NBR = (NIR - SWIR2) / (NIR + SWIR2)
  var nbr = image.normalizedDifference(["B8", "B12"]).rename("nbr");
  return image.addBands(nbr);
}

// 3. Cloud masking parameters
var csPlus = ee.ImageCollection("GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED");
var QA_BAND = "cs_cdf";
var CLEAR_THRESHOLD = 0.6;

// Function to generate the clearest Sentinel-2 composite with indices
function getBestComposite(year, startMonth, endMonth, aoi) {
  // Define start and end dates for the range
  var startDate = ee.Date.fromYMD(year, startMonth, 1);
  var endDate = ee.Date.fromYMD(year, endMonth, 1).advance(1, "month");

  // Filter Sentinel-2 SR harmonized collection, mask clouds
  var collection = ee
    .ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterDate(startDate, endDate)
    .filterBounds(aoi)
    .linkCollection(csPlus, [QA_BAND])
    .map(function (img) {
      img = ee.Image(img);
      var bands = ["B2", "B3", "B4", "B8", "B12", QA_BAND];
      var sel = img.select(bands);

      // Scale reflectance bands (0–1)
      var refl = sel.select(["B2", "B3", "B4", "B8", "B12"]).divide(10000);
      var scaled = refl.addBands(sel.select([QA_BAND]));

      // Mask cloudy pixels
      var masked = scaled.updateMask(
        scaled.select(QA_BAND).gte(CLEAR_THRESHOLD)
      );

      // Compute all indices once
      return calculateEVI(calculateBAI(calculateNBR(masked))).copyProperties(
        img,
        img.propertyNames()
      );
    });

  // Create pixel-wise best-clear composite
  var mosaic = collection.qualityMosaic(QA_BAND).clip(aoi);

  // Explicitly ensure all indices exist on the final mosaic
  var mosaicWithIndices = calculateEVI(calculateBAI(calculateNBR(mosaic)));

  // Select only the bands you want to keep
  return mosaicWithIndices.select([
    "B2",
    "B3",
    "B4",
    "B8",
    "evi",
    "bai",
    "nbr",
  ]);
}
// 5. Generate composites for September 2023, 2024, 2025
var bestSept23 = getBestComposite(2023, 9, 9, darkwoods_nextcreek);
var bestSept24 = getBestComposite(2024, 9, 9, darkwoods_nextcreek);
var bestSept25 = getBestComposite(2025, 9, 9, darkwoods_nextcreek);

// 6. Visualize data

// BAI
var baiScaled = bestSept25.select("bai").unitScale(21.6, 206.7); // 2nd → 98th percentile from your print
var baiVis = {
  bands: ["bai"],
  min: 0,
  max: 1,
  palette: ["#000000", "#440154", "#3b528b", "#21918c", "#5dc863", "#fde725"],
};

// NBR
var nbrScaled = bestSept25.select("nbr").unitScale(-0.5, 0.8);
var nbrVis = {
  bands: ["nbr"],
  min: 0,
  max: 1, // after unitScale
  palette: [
    "#d73027", // red – burned/disturbed
    "#fdae61", // orange
    "#ffffbf", // yellow – low vegetation
    "#a6d96a", // light green
    "#1a9850", // dark green – healthy vegetation
  ],
};

// EVI
var eviScaled = bestSept25.select("evi").unitScale(0, 0.8);
var eviVis = {
  bands: ["evi"],
  min: 0,
  max: 1, // after unitScale
  palette: ["#d73027", "#f46d43", "#fee08b", "#66bd63", "#1a9850"],
};

// Add to map
Map.addLayer(baiScaled, baiVis, "EVI Sept 2025");
Map.addLayer(eviScaled, eviVis, "EVI Sept 2025");
Map.addLayer(nbrScaled, nbrVis, "NBR Sept 2025");

// Visualize True Color for September 2025
var rgbVis = { bands: ["B4", "B3", "B2"], min: 0.0, max: 0.25, gamma: 1.3 };
Map.addLayer(bestSept24, rgbVis, "Sept 2025 True Color");

// =====================================================================================
// 7. Export bands

// Define export region
var exportRegion = darkwoods_nextcreek.geometry();

// Define bands to export
var bandsToExport = ["B4", "B3", "B2", "bai", "evi", "nbr"];

// Define composites
var composites = {
  2023: bestSept23,
  2024: bestSept24,
  2025: bestSept25,
};

// Define root folder and bands
var rootFolder = "Darkwoods";
var rgbBands = ["B4", "B3", "B2"];
var analyticBands = ["bai", "evi", "nbr"];

// // Loop over years and export bands
// Object.keys(composites).forEach(function(year) {
//   var image = composites[year];

//   // Export RGB bands as Uint16
//   rgbBands.forEach(function(bandName) {
//     var singleBandImage = image.select(bandName)
//       .unitScale(0, 0.25)       // scale reflectance to 0–0.25 for visualization
//       .multiply(65535)          // scale to 0–65535 for Uint16
//       .toUint16();

//     var folder = rootFolder + '/dw_' + year;
//     var monthStr = '09';
//     var filePrefix = 'dw_' + monthStr + year + '_' + bandName;

//     Export.image.toDrive({
//       image: singleBandImage,
//       description: filePrefix,
//       folder: folder,
//       fileNamePrefix: filePrefix,
//       region: exportRegion,
//       scale: 10,
//       crs: 'EPSG:3005',
//       fileFormat: 'GeoTIFF',
//       maxPixels: 1e13
//     });
//   });

//   // Export analytical bands as float
//   analyticBands.forEach(function(bandName) {
//     var singleBandImage = image.select(bandName); // keep raw float values

//     var folder = rootFolder + '/dw_' + year;
//     var monthStr = '09';
//     var filePrefix = 'dw_' + monthStr + year + '_' + bandName;

//     Export.image.toDrive({
//       image: singleBandImage,
//       description: filePrefix,
//       folder: folder,
//       fileNamePrefix: filePrefix,
//       region: exportRegion,
//       scale: 10,
//       crs: 'EPSG:3005',
//       fileFormat: 'GeoTIFF',
//       maxPixels: 1e13
//     });
//   });
// });

// 8. Export AOI (Darkwoods + Next Creek buffer) as shapefile
Export.table.toDrive({
  collection: darkwoods_nextcreek,
  description: "darkwoods_nextcreek_buffer",
  folder: "Darkwoods",
  fileNamePrefix: "darkwoods_nextcreek_1km_buffer",
  fileFormat: "SHP",
});
