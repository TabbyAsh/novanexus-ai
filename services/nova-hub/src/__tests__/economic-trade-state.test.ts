import {
  requestsFieldMeasurementTask,
  targetsTrade0001,
} from '../economic-trade-state';

describe('economic Trade deterministic routing', () => {
  test.each([
    'What is blocking Trade #0001?',
    'Show me trade 1',
    'How do we close the commercial site opportunity?',
    'Create the field measurement task',
  ])('recognizes Trade #0001 intent: %s', message => {
    expect(targetsTrade0001(message)).toBe(true);
  });

  test.each([
    'What stocks are moving?',
    'Show my journal',
    'Appraise this drill for $35',
  ])('does not steal unrelated intent: %s', message => {
    expect(targetsTrade0001(message)).toBe(false);
  });

  test.each([
    'Create the field measurement task for Trade #0001.',
    'Start a site measurement checklist for the commercial site.',
    'Field-measurement task: create it.',
  ])('recognizes a durable field-task command: %s', message => {
    expect(requestsFieldMeasurementTask(message)).toBe(true);
  });

  test.each([
    'What is blocking Trade #0001?',
    'Show the field measurement requirement.',
    'Which provider can measure the buildings?',
  ])('keeps inspection separate from task creation: %s', message => {
    expect(requestsFieldMeasurementTask(message)).toBe(false);
  });
});
