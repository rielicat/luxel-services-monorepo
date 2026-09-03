const DIRECTIVE_PATTERNS = [
  /^\s*eslint-disable(?:-next-line|-line)?\s+\S/,
  /^\s*eslint-enable(?:\s|$)/,
  /^\s*globals?\s/,
  /^\s*exported(?:\s|$)/,
  /^\s*@ts-expect-error(?:\s|$)/,
];

const BLANKET_DISABLE = /^\s*eslint-disable(?:-next-line|-line)?\s*(?:--[^\n]*)?$/;

const TRIPLE_SLASH_REFERENCE = /^\/\s*<reference\s/;

function isDirective(comment) {
  if (DIRECTIVE_PATTERNS.some((pattern) => pattern.test(comment.value))) return true;
  return comment.type === 'Line' && TRIPLE_SLASH_REFERENCE.test(comment.value);
}

function isBlanketDisable(comment) {
  return BLANKET_DISABLE.test(comment.value);
}

function locBeforeDirective(loc) {
  return { start: { line: loc.start.line, column: -1 }, end: loc.end };
}

const noComments = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow source comments. Only tool directives may stay.',
    },
    schema: [],
    messages: {
      noComment:
        'Comments are not allowed. Only eslint directives, @ts-expect-error and /// <reference> may stay.',
      blanketDisable:
        'A blanket eslint-disable switches off every rule in the file. Name the rules to disable.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    return {
      Program() {
        for (const comment of sourceCode.getAllComments()) {
          if (isBlanketDisable(comment)) {
            const loc = sourceCode.getLoc ? sourceCode.getLoc(comment) : comment.loc;
            context.report({ loc: locBeforeDirective(loc), messageId: 'blanketDisable' });
            continue;
          }
          if (isDirective(comment)) continue;
          context.report({ node: comment, messageId: 'noComment' });
        }
      },
    };
  },
};

export default {
  meta: { name: 'luxel', version: '0.0.0' },
  rules: { 'no-comments': noComments },
};
