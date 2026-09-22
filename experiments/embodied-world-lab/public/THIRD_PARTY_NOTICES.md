# Third-Party Notices

## RobotExpressive walking character

The `src/assets/RobotExpressive.glb` asset is an unmodified copy from the [official Three.js skinning and morphing example](https://github.com/mrdoob/three.js/blob/dev/examples/webgl_animation_skinning_morph.html).

- Model: **Tomás Laulhé (Quaternius)**.
- Upstream modifications: **Don McCurdy**.
- Model license stated by the official example: **CC0-1.0** ([full legal terms](https://creativecommons.org/publicdomain/zero/1.0/legalcode)).
- [Upstream model file](https://github.com/mrdoob/three.js/blob/dev/examples/models/gltf/RobotExpressive/RobotExpressive.glb).

The local asset is 463,988 bytes, SHA-256 `047f5e5fb3bb6d378bd1df16ca6137f2a596c99b3a1b5690b4020c05aaf6f319`. Its geometry, colors and animation clips have not been edited. The application adds navigation, positioning, display scale and animation selection. This is a walking-character demonstration; using this asset does not imply robot hardware or vehicle dynamics. No author or provider endorsement is implied.

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

The Tokyo city scene uses LOD2 building geometry from Japan's Ministry of Land, Infrastructure, Transport and Tourism, Project PLATEAU, Chiyoda-ku 2025 dataset. The default display is a locally processed, untextured white building mesh; the original online textured display remains optional. This white mesh is not Google data and is not a global building service. Source resources:

- [PLATEAU dataset documentation](https://docs.plateauview.mlit.go.jp/datasets/3d-tiles/)
- [Chiyoda-ku 2025 dataset catalog page](https://www.geospatial.jp/ckan/dataset/plateau-13101-chiyoda-ku-2025)
- [Source 3D Tiles tileset](https://assets.cms.plateau.reearth.io/assets/28/07d0a1-b6be-46ef-bd87-4f0683b5ef6e/13101_chiyoda-ku_pref_2025_citygml_1_op_bldg_3dtiles_13101_chiyoda-ku_lod2/tileset.json)
- [PLATEAU site policy and attribution terms](https://www.mlit.go.jp/plateau/site-policy/)

The PLATEAU general site policy applies PDL1.0 terms unless a resource carries a separate rights notice, and permits compatible CC BY 4.0 use. Dataset-specific override terms have not been independently verified from the catalog page. Keep the source attribution and identify processing; do not treat these assets as relicensed under the repository's top-level license.

Modification notice: this experiment decodes the original highest-detail building triangles from 64 source tiles, containing 879 unique source building identifiers, into a collision dataset. It omits textures and materials, applies the source transforms and RTC positions, and stores vertices as local ECEF offsets rounded to 0.001 metres. Source building positions receive no height shift, and no OSM footprint extrusion is used. The tracked `src/assets/tokyo-colliders.json` retains source URLs, hashes, building identifiers and transformation evidence; `scripts/prepare-city-colliders.mjs` reproduces the processing.

The default white rendering, navigation and collision share `src/assets/tokyo-buildings.bin`. `scripts/prepare-city-binary.mjs` creates this file offline from the tracked JSON by merging only identical source coordinates, then encoding positions as Float32 and indices as Uint32. All 317,525 triangles retain their order and winding; there is no triangle simplification. Maximum individual coordinate conversion error relative to the source JSON is approximately 0.00006055 metres. The binary is 5,861,120 bytes including its metadata header, compared with 29,790,254 bytes for the JSON. Provenance, hashes and the modification notice are retained in `src/assets/tokyo-buildings.meta.json`.

The separate **38-metre ellipsoidal-height walking plane is an application approximation**, not a PLATEAU road or terrain survey. The experiment also adds the character, target, navigation behavior and safety controls. This is not an official MLIT/PLATEAU navigation product and does not imply provider endorsement.

## Map display services

The default white-building mode uses [Esri World Light Gray Base](https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer?f=pjson), with this service credit: **Esri, HERE, Garmin, (c) OpenStreetMap contributors, and the GIS user community**. The Tokyo demo caps this display layer at level 16 to match checked tile availability. Esri World Imagery supplies display imagery for the textured mode. The retained mountain presets use ArcGIS World Elevation for their elevation source; those orthometric elevation values are not the source of the Tokyo scene's 38-metre ellipsoidal walking plane. Map provider credits remain displayed in the scene. Imagery is not supplied to Jev as visual evidence, and this notice grants no separate right to redistribute the providers' online tiles.

## Optional Google Photorealistic 3D Tiles

Google Photorealistic 3D Tiles is an optional online preview source, requiring the user's configured Google Maps Platform API key or Cesium ion token with access to the asset. This integration does not redistribute Google tiles or derive a collision dataset from them. Character navigation is disabled in this mode because the bundled PLATEAU navigation and collision geometry does not describe Google's scene. The current local environment has no configured Google access credential, so live access has not been verified.

Google branding and tile-level provider attributions must remain visible, as required by the [Google Map Tiles API policies](https://developers.google.com/maps/documentation/tile/policies). Access is subject to the provider's terms and account usage limits; this repository supplies no Google data license or API entitlement. See the [Cesium integration guide](https://cesium.com/learn/cesiumjs-learn/cesiumjs-photorealistic-3d-tiles/) for account and token setup.
