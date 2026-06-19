---
type: ArtifactType
defines: Gadget
description: A type exercising the json_schema escape hatch in addition to the dialect.
fields:
  id:
    required: true
json_schema:
  type: object
  properties:
    level:
      type: integer
      minimum: 1
  required: [level]
---
