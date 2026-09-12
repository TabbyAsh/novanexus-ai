// Standalone lookup for supplied cases only. Inputs are normalized categorical/bin vectors.
const decoders = [
  {
    "channel": "public",
    "observationIds": [],
    "rows": [
      {
        "caseId": "E",
        "values": []
      },
      {
        "caseId": "Q",
        "values": []
      }
    ]
  },
  {
    "channel": "internal",
    "observationIds": [
      "reason"
    ],
    "rows": [
      {
        "caseId": "E",
        "values": [
          "time"
        ]
      },
      {
        "caseId": "Q",
        "values": [
          "noise"
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
