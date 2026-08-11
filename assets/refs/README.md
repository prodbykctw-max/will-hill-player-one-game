# Client reference art

Everything here arrived as a chat attachment and existed nowhere else — not on
disk, not in Drive, not re-downloadable from any service. They were recovered
out of the session transcript, where the harness stores attachments as base64.

Committed deliberately, per CLAUDE.md: *if losing the file means the work
cannot be rebuilt, commit it.* Losing these means asking the client to send
them again.

| file | what it is | used by |
|---|---|---|
| `underground-day.webp` | Daytime Five Points / UNDERGROUND plate, 1122x1402 — the exact dimensions of the existing night plate, so it drops straight into the same pipeline | `tools/cut_planes.py`, stage `underground` |
| `stages-day-sheet.webp` | Three daytime stage panels on one sheet: Edgewood (Colour Bar ATL) top-left, L5P (Criminal Records) top-right, EAV (Welcome To East Atlanta) bottom | cut into per-stage plates |
| `marta-map.webp` | Stylized MARTA rail system map, the client's own art | `src/render/martamap.js` interstitial |
| `ending-mockup.webp` | The finale screen the client wants: performance on the left, stats and credits on the right, 90s-movie split | finale layout reference |
| `vinyl-stage.webp` | Photograph — the stage at Vinyl, Atlanta. The performer is to be replaced with Will Hill | finale |
| `vinyl-crowd.webp` | Photograph — the crowd at the same show | finale |

The two Vinyl files are PHOTOGRAPHS OF REAL, IDENTIFIABLE PEOPLE at a real
show. Pixel-art conversion abstracts faces but does not anonymise them. Before
any of that crowd ships in a build, confirm with the client whether the faces
stay recognisable or the crowd is rendered as lit silhouettes.
