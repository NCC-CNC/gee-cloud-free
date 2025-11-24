# gee-cloud-free
Google Earth Engine scripts for generating cloud-free Sentinel-2 imagery over an area of interest.

## Description
This workflow produces an analysis-ready Sentinel-2 composite for a specified area and date range. Cloudy pixels are removed using the Cloud Score+ (cs_cdf) band, and reflectance bands are scaled to 0–1.

A pixel-wise quality mosaic is used to select the clearest available pixel at each location. The final composite is clipped to the AOI.

## Indices
The following remote-sensing indices are generated:

1. Enhanced Vegetation Index (EVI): highlights vegetation health.  
2. Burn Area Index (BAI): identifies potential burned areas.  
3. Normalized Burn Ratio (NBR): detects vegetation loss, wildfire burn severity, or canopy disturbance.

## Download
Red, green, and blue bands—along with all generated indices—are exported to a Google Drive folder. These outputs can then be manually downloaded for further analysis in desktop GIS, such as change detection.
