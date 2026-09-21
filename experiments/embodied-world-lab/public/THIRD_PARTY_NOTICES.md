# Third-Party Notices

## Fox glTF sample asset

Canonical source: [KhronosGroup glTF Sample Assets / Models / Fox](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/Fox)

The binary distributed in this experiment as `src/assets/Fox.glb` is an unmodified copy of the upstream Fox sample asset.

Attribution from the upstream [Fox README](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/Models/Fox/README.md):

- Model: PixelMannen, licensed under CC0-1.0.
- Rigging and animation: tomkranis, licensed under CC-BY-4.0.
- Conversion to glTF: AsoboStudio and scurest, licensed under CC-BY-4.0.

The upstream license metadata is available in the [canonical Fox LICENSE file](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/Models/Fox/LICENSE.md). Full license terms are available from [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode) and [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/legalcode).

The Fox asset remains subject to those upstream Creative Commons terms. It is not relicensed under this repository's top-level MIT license. Logos and associated trademarks are excluded from the upstream asset licenses; no endorsement is implied.

## PLATEAU Tokyo building data

Attribution: **出典：国土交通省 Project PLATEAU（千代田区・2025年度）**

The Tokyo city scene displays textured LOD2 building data from Japan's Ministry of Land, Infrastructure, Transport and Tourism, Project PLATEAU, Chiyoda-ku 2025 dataset. Source resources:

- [PLATEAU dataset documentation](https://docs.plateauview.mlit.go.jp/datasets/3d-tiles/)
- [Chiyoda-ku 2025 dataset catalog page](https://www.geospatial.jp/ckan/dataset/plateau-13101-chiyoda-ku-2025)
- [Source 3D Tiles tileset](https://assets.cms.plateau.reearth.io/assets/28/07d0a1-b6be-46ef-bd87-4f0683b5ef6e/13101_chiyoda-ku_pref_2025_citygml_1_op_bldg_3dtiles_13101_chiyoda-ku_lod2/tileset.json)
- [PLATEAU site policy and attribution terms](https://www.mlit.go.jp/plateau/site-policy/)

The PLATEAU general site policy applies PDL1.0 terms unless a resource carries a separate rights notice, and permits compatible CC BY 4.0 use. Dataset-specific override terms have not been independently verified from the catalog page. Keep the source attribution and identify processing; do not treat these assets as relicensed under the repository's top-level license.

Modification notice: this experiment decodes the original highest-detail building triangles from 16 source tiles into a collision dataset, omits textures and materials from that dataset, applies the source transforms and RTC positions, and stores vertices as local ECEF offsets rounded to 0.001 metres. Source building positions receive no height shift, and no OSM footprint extrusion is used. The tracked `src/assets/tokyo-colliders.json` retains source URLs, hashes, building identifiers and transformation evidence; `scripts/prepare-city-colliders.mjs` reproduces the processing.

The separate **38-metre ellipsoidal-height walking plane is an application approximation**, not a PLATEAU road or terrain survey. The experiment also adds the character, target, navigation behavior and safety controls. This is not an official MLIT/PLATEAU navigation product and does not imply provider endorsement.

## Map display services

Esri World Imagery supplies display imagery. The retained mountain presets use ArcGIS World Elevation for their elevation source; those orthometric elevation values are not the source of the Tokyo scene's 38-metre ellipsoidal walking plane. Map provider credits remain displayed in the scene. Imagery is not supplied to Jev as visual evidence, and this notice grants no separate right to redistribute the providers' online tiles.
