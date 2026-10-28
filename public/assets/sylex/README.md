# Textúry témy Sylex

Táto zložka obsahuje lokálne fotografické PBR textúry pre `public/sylex-3d.js`. Používajú sa iba v téme Sylex Tower Defence.

| Sada Poly Haven | Použitie |
| --- | --- |
| `grass_ground` | Trávnatý terén |
| `aerial_asphalt_01` | Cesta, parkovisko a strecha |
| `concrete_pavement` | Obrubníky, podstavce a betónové plochy |
| `bark_brown_02` | Kmene a konáre |
| `corrugated_iron_03` | Kovový obklad budovy |

Každá sada má tri JPG mapy v rozlíšení 1k: `-color` (diffuse, sRGB), `-normal` (OpenGL normal) a `-rough` (roughness). Spolu je to 15 súborov, 9 801 828 bajtov, približne 9,8 MB počiatočného prenosu textúr pred využitím cache. Knižnica Three.js a ostatné súbory nie sú v tejto veľkosti zahrnuté.

Všetky uvedené textúry pochádzajú z **Poly Haven** a sú poskytované pod licenciou **CC0**. [sources.json](sources.json) uvádza pre každý súbor pôvodnú adresu na stiahnutie, stránku assetu a licenciu. Je to evidencia pôvodu; renderer sťahuje mapy z `/assets/sylex/`, nie z týchto externých adries.

Three.js **0.180.0** je uložený v `public/vendor/three/` a používa licenciu MIT; úplné znenie je v [LICENSE](../../vendor/three/LICENSE). Scéna nepotrebuje externé runtime požiadavky ani CDN. Odkaz na Poly Haven v návode hry slúži ako uvedenie zdroja.

Geometria budovy, áut, operátorov a veží vzniká v kóde. Textúra listov, popisky a prostredie pre odrazy sa generujú lokálne; nie sú súčasťou týchto 15 fotografických máp. Pri nedostupnosti WebGL alebo zlyhaní načítania scény integrácia používa pôvodný canvas renderer.
