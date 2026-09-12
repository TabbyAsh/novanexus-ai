// Standalone lookup for supplied cases only. Inputs are normalized categorical/bin vectors.
const decoders = [
  {
    "channel": "inspection",
    "observationIds": [
      "a-before-b",
      "b-before-a"
    ],
    "rows": [
      {
        "caseId": "AB",
        "values": [
          true,
          false
        ]
      },
      {
        "caseId": "BA",
        "values": [
          false,
          true
        ]
      },
      {
        "caseId": "ABA",
        "values": [
          true,
          true
        ]
      },
      {
        "caseId": "BAB",
        "values": [
          true,
          true
        ]
      }
    ]
  }
];
function decode(channel, vector) {
 const decoder = decoders.find(d => d.channel === channel);
 if (!decoder || !Array.isArray(vector) || vector.length !== decoder.observationIds.length || vector.some(v => v === null || !['string', 'boolean'].includes(typeof v))) return { status: 'unknown', candidateCaseIds: [] };
 const compatible = decoder.rows.filter(row => row.values.every((v, i) => v === null || v === vector[i]));
 const complete = compatible.filter(row => !row.values.includes(null));
 return { status: !complete.length ? 'unknown' : compatible.length === 1 ? 'unique' : 'ambiguous', candidateCaseIds: compatible.map(row => row.caseId) };
}
module.exports = { decoders, decode };
