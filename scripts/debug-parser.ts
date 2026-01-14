import { documentParser } from '../src/agents/product-factors-assessor/parsers/document-parser';
import * as fs from 'fs';

const content = fs.readFileSync('/tmp/epic4-community-engagement.md', 'utf-8');
console.log('=== PARSING EPIC CONTENT ===');
console.log('Content length:', content.length);

const stories = documentParser.parseUserStories(content);
console.log('\n=== PARSED USER STORIES ===');
console.log('Number of stories:', stories.length);

for (let idx = 0; idx < stories.length; idx++) {
  const story = stories[idx];
  console.log('\nStory ' + (idx + 1) + ':');
  console.log('  ID:', story.id);
  console.log('  Title:', story.title);
  console.log('  As a:', story.asA);
  console.log('  I want:', story.iWant);
  console.log('  AC count:', story.acceptanceCriteria.length);
  if (story.acceptanceCriteria.length > 0) {
    console.log('  ACs:');
    story.acceptanceCriteria.forEach((ac, i) => {
      console.log('    - ' + ac.description);
    });
  }
  console.log('  Tags:', story.tags);
}
