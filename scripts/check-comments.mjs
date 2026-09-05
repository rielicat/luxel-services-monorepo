import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';

const RULE_NAME = ['luxel', 'no-comments'].join('/');
const RULE_PATTERN = RULE_NAME.replace('/', '\\/');
const SELF = 'scripts/check-comments.mjs';
const SCANNED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.json'];
const HASH_EXTENSIONS = ['.yml', '.yaml', '.toml'];
const MIGRATIONS_PREFIX = 'supabase/migrations/';
const GENERATED = ['pnpm-lock.yaml'];

function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 32e6 });
  return out.split('\0').filter(Boolean);
}

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (text[i] === '\n') line += 1;
  return line;
}

function findCssComments(text) {
  const hits = [];
  let quote = null;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quote) {
      if (char === '\\') i += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '/' && text[i + 1] === '*') {
      hits.push({ line: lineOf(text, i), kind: 'block' });
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 1;
    }
  }
  return hits;
}

function findHashComments(text, anyHash) {
  const hits = [];
  text.split('\n').forEach((raw, index) => {
    let quote = null;
    for (let i = 0; i < raw.length; i += 1) {
      const char = raw[i];
      if (quote) {
        if (char === '\\') i += 1;
        else if (char === quote) quote = null;
        continue;
      }
      if (char === '"' || char === "'") {
        quote = char;
        continue;
      }
      if (char !== '#') continue;
      if (anyHash || i === 0 || raw[i - 1] === ' ' || raw[i - 1] === '\t') {
        hits.push({ line: index + 1 });
        return;
      }
    }
  });
  return hits;
}

function findSqlComments(text) {
  const hits = [];
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (char === "'" || char === '"') {
      i += 1;
      while (i < text.length) {
        if (text[i] === char) {
          if (text[i + 1] === char) {
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (char === '-' && text[i + 1] === '-') {
      hits.push({ line: lineOf(text, i), kind: 'line' });
      const end = text.indexOf('\n', i);
      i = end === -1 ? text.length : end;
      continue;
    }
    if (char === '/' && text[i + 1] === '*') {
      hits.push({ line: lineOf(text, i), kind: 'block' });
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 2;
      continue;
    }
    i += 1;
  }
  return hits;
}

const NAMED_DISABLE = new RegExp(`eslint-disable[^\\n]*${RULE_PATTERN}`);
const TURNED_OFF = new RegExp(`${RULE_PATTERN}['"\`]?\\s*:\\s*['"\`]?(off|0)\\b`);
const BLANKET_BLOCK = /\/\*\s*eslint-disable(?:-next-line|-line)?\s*(?:--[^*]*)?\*\//;
const BLANKET_LINE = /\/\/\s*eslint-disable(?:-next-line|-line)?\s*(?:--.*)?$/;

function findRuleEscapes(text) {
  const hits = [];
  text.split('\n').forEach((raw, index) => {
    const line = raw.replace(/\r$/, '');
    if (
      NAMED_DISABLE.test(line) ||
      TURNED_OFF.test(line) ||
      BLANKET_BLOCK.test(line) ||
      BLANKET_LINE.test(line)
    ) {
      hits.push({ line: index + 1, text: line.trim() });
    }
  });
  return hits;
}

function isScanned(path) {
  if (GENERATED.includes(path)) return false;
  const extension = path.slice(path.lastIndexOf('.'));
  if (extension === '.sql') return path.startsWith(MIGRATIONS_PREFIX);
  if (HASH_EXTENSIONS.includes(extension)) return true;
  return SCANNED_EXTENSIONS.includes(extension);
}

function scanFile(path, text) {
  const problems = [];
  const extension = path.slice(path.lastIndexOf('.'));

  if (extension === '.css') {
    for (const hit of findCssComments(text)) {
      problems.push(`${path}:${hit.line}  CSS ${hit.kind} comment is not allowed`);
    }
  }

  if (extension === '.sql') {
    for (const hit of findSqlComments(text)) {
      problems.push(`${path}:${hit.line}  SQL ${hit.kind} comment is not allowed`);
    }
  }

  if (HASH_EXTENSIONS.includes(extension)) {
    for (const hit of findHashComments(text, extension === '.toml')) {
      problems.push(`${path}:${hit.line}  comment is not allowed; document it in docs/`);
    }
  }

  for (const hit of findRuleEscapes(text)) {
    problems.push(`${path}:${hit.line}  ${RULE_NAME} must stay on: ${hit.text}`);
  }

  return problems;
}

const SELF_TEST_CASES = [
  {
    name: 'css remote asset url is not a comment',
    path: 'apps/web/src/app/globals.css',
    text: '.hero { background-image: url(https://cdn.example.com/hero.png); }\n',
    expected: 0,
  },
  {
    name: 'css protocol-relative url is not a comment',
    path: 'apps/web/src/app/globals.css',
    text: '.hero { background-image: url(//cdn.example.com/hero.png); }\n',
    expected: 0,
  },
  {
    name: 'css block comment is reported',
    path: 'apps/web/src/app/globals.css',
    text: '/* palette */\n.hero { color: red; }\n',
    expected: 1,
  },
  {
    name: 'css comment inside a string is not reported',
    path: 'apps/web/src/app/globals.css',
    text: '.hero::after { content: "/* not a comment */"; }\n',
    expected: 0,
  },
  {
    name: 'sql line comment is reported',
    path: 'supabase/migrations/0001_init.sql',
    text: '-- create the table\ncreate table t (id int);\n',
    expected: 1,
  },
  {
    name: 'sql block comment is reported',
    path: 'supabase/migrations/0001_init.sql',
    text: 'create table t (id int); /* later */\n',
    expected: 1,
  },
  {
    name: 'dashes inside a single-quoted string are not a comment',
    path: 'supabase/migrations/0001_init.sql',
    text: "insert into t (note) values ('a -- b');\n",
    expected: 0,
  },
  {
    name: 'doubled quotes keep the string open',
    path: 'supabase/migrations/0001_init.sql',
    text: "insert into t (note) values ('it''s -- fine');\n",
    expected: 0,
  },
  {
    name: 'a comment inside a plpgsql body is reported',
    path: 'supabase/migrations/0001_init.sql',
    text: 'create function f() returns void as $$\nbegin\n  perform 1; -- kept\nend;\n$$ language plpgsql;\n',
    expected: 1,
  },
  {
    name: 'a comment inside a tagged dollar-quoted body is reported',
    path: 'supabase/migrations/0001_init.sql',
    text: 'select $body$ a -- b $body$;\n',
    expected: 1,
  },
  {
    name: 'sql without comments passes',
    path: 'supabase/migrations/0001_init.sql',
    text: 'alter table t add column n text;\n',
    expected: 0,
  },
  {
    name: 'yaml comment is reported',
    path: '.github/workflows/ci.yml',
    text: 'jobs:\n  # run the checks\n  build: {}\n',
    expected: 1,
  },
  {
    name: 'yaml hash inside a quoted value is not a comment',
    path: '.github/workflows/ci.yml',
    text: "jobs:\n  build:\n    run: echo '::notice::a # b'\n",
    expected: 0,
  },
  {
    name: 'toml comment is reported',
    path: 'workers/whatsapp/wrangler.toml',
    text: '# pinned\nname = "w"\n',
    expected: 1,
  },
  {
    name: 'toml hash inside a string is not a comment',
    path: 'workers/whatsapp/wrangler.toml',
    text: 'name = "a # b"\n',
    expected: 0,
  },
  {
    name: 'toml comment with no space before the hash is reported',
    path: 'workers/whatsapp/wrangler.toml',
    text: 'name = "w"#pinned\n',
    expected: 1,
  },
  {
    name: 'a hash with no leading space is a value, not a comment',
    path: 'infra/cloudflare/Pulumi.prod.yaml',
    text: 'config:\n  colour: ff#00\n',
    expected: 0,
  },
  {
    name: 'blanket block disable is an escape hatch',
    path: 'apps/web/src/probe.ts',
    text: '/* eslint-disable */\nexport const a = 1;\n',
    expected: 1,
  },
  {
    name: 'blanket block disable with a justification is an escape hatch',
    path: 'apps/web/src/probe.ts',
    text: '/* eslint-disable -- legacy */\nexport const a = 1;\n',
    expected: 1,
  },
  {
    name: 'blanket next-line disable is an escape hatch',
    path: 'apps/web/src/probe.ts',
    text: '// eslint-disable-next-line\nexport const a = 1;\n',
    expected: 1,
  },
  {
    name: 'blanket same-line disable is an escape hatch',
    path: 'apps/web/src/probe.ts',
    text: 'export const a = 1; // eslint-disable-line\n',
    expected: 1,
  },
  {
    name: 'named disable of this rule is an escape hatch',
    path: 'apps/web/src/probe.ts',
    text: `// eslint-disable-next-line ${RULE_NAME}\nexport const a = 1;\n`,
    expected: 1,
  },
  {
    name: 'turning this rule off in config is an escape hatch',
    path: 'apps/web/eslint.config.mjs',
    text: `export default [{ rules: { '${RULE_NAME}': 'off' } }];\n`,
    expected: 1,
  },
  {
    name: 'named disable of another rule is allowed',
    path: 'apps/web/src/probe.ts',
    text: '// eslint-disable-next-line @typescript-eslint/no-explicit-any\nexport const a = 1;\n',
    expected: 0,
  },
];

function runSelfTest() {
  const failures = [];
  for (const testCase of SELF_TEST_CASES) {
    const found = scanFile(testCase.path, testCase.text);
    if (found.length !== testCase.expected) {
      failures.push(
        `${testCase.name}: expected ${testCase.expected} problem(s), got ${found.length}` +
          (found.length > 0 ? `\n    ${found.join('\n    ')}` : ''),
      );
    }
  }
  if (failures.length > 0) {
    for (const failure of failures) console.error(`self-test FAILED  ${failure}`);
    process.exit(1);
  }
  console.log(`check-comments: ${SELF_TEST_CASES.length} self-test case(s) passed.`);
}

if (process.argv.includes('--self-test')) {
  runSelfTest();
} else {
  const root = process.cwd();
  const problems = [];

  for (const file of trackedFiles()) {
    const path = relative(root, file) || file;
    if (path === SELF) continue;
    if (!isScanned(path)) continue;

    let text;
    try {
      text = readFileSync(path, 'utf8');
    } catch {
      continue;
    }

    problems.push(...scanFile(path, text));
  }

  if (problems.length > 0) {
    for (const problem of problems) console.error(problem);
    console.error(`\n${problems.length} comment problem(s) found.`);
    process.exit(1);
  }

  console.log('check-comments: no comment problems found.');
}
