const TARGET_SUFFIX = 'server/control-plane/loggers/PostHogEvents.ts';

function normalizePath(filename) {
  return filename.replace(/\\/g, '/');
}

function isTargetFile(filename) {
  const normalized = normalizePath(filename);
  return normalized.endsWith(TARGET_SUFFIX);
}

function getUnionValues(node) {
  return node.types
    .map((typeNode) => {
      if (
        typeNode.type === 'TSLiteralType' &&
        typeNode.literal.type === 'Literal'
      ) {
        return typeNode.literal.value;
      }
      return null;
    })
    .filter((value) => typeof value === 'string');
}

function getObjectKeys(node) {
  return node.properties
    .map((prop) =>
      prop.type === 'Property'
        ? prop.key.type === 'Identifier'
          ? prop.key.name
          : prop.key.type === 'Literal'
            ? prop.key.value
            : null
        : null,
    )
    .filter((key) => typeof key === 'string');
}

function isSorted(values) {
  for (let i = 1; i < values.length; i += 1) {
    if (values[i - 1].localeCompare(values[i]) > 0) {
      return false;
    }
  }
  return true;
}

function findObjectExpression(init) {
  if (!init || init.type !== 'CallExpression') {
    return null;
  }
  if (!init.arguments.length) {
    return null;
  }
  const [firstArg] = init.arguments;
  return firstArg && firstArg.type === 'ObjectExpression' ? firstArg : null;
}

function isStringLiteralType(node) {
  return (
    node.type === 'TSLiteralType' &&
    node.literal &&
    node.literal.type === 'Literal' &&
    typeof node.literal.value === 'string'
  );
}

function getPropertyKey(prop) {
  if (prop.type !== 'Property' || prop.computed) {
    return null;
  }
  if (prop.key.type === 'Identifier') {
    return prop.key.name;
  }
  if (prop.key.type === 'Literal' && typeof prop.key.value === 'string') {
    return prop.key.value;
  }
  return null;
}

function getPreferredNewline(sourceCode) {
  return sourceCode.text.includes('\r\n') ? '\r\n' : '\n';
}

function getObjectIndent(sourceCode, objectExpression) {
  const openingBrace = sourceCode.getFirstToken(objectExpression);
  const firstProperty = objectExpression.properties.find(
    (prop) => prop && prop.type === 'Property',
  );
  if (!openingBrace || !firstProperty) {
    return '';
  }
  const betweenText = sourceCode.text.slice(
    openingBrace.range[1],
    firstProperty.range[0],
  );
  const match = betweenText.match(/(\r?\n)([ \t]*)$/);
  if (match) {
    return match[2] ?? '';
  }
  return '';
}

function buildSortedUnionText(unionType, sortedTexts, sourceCode) {
  if (!sortedTexts.length) {
    return null;
  }
  const unionText = sourceCode.getText(unionType);
  const match = unionText.match(/(\r?\n)([ \t]*)\|/);
  if (match) {
    const newline = match[1];
    const indent = match[2] ?? '';
    const prefix = `${newline}${indent}| `;
    return sortedTexts.map((text) => `${prefix}${text}`).join('');
  }
  return ` ${sortedTexts.join(' | ')}`;
}

function buildSortedObjectText(objectExpression, sortedProperties, sourceCode) {
  if (!sortedProperties.length) {
    return null;
  }
  const openingBrace = sourceCode.getFirstToken(objectExpression);
  const closingBrace = sourceCode.getLastToken(objectExpression);
  if (!openingBrace || !closingBrace) {
    return null;
  }
  const newline = getPreferredNewline(sourceCode);
  const indent = getObjectIndent(sourceCode, objectExpression);
  const beforeClosingToken = sourceCode.getTokenBefore(closingBrace, {
    includeComments: true,
  });
  const hasTrailingComma =
    beforeClosingToken && beforeClosingToken.value === ',';
  const closingWhitespaceStart = beforeClosingToken
    ? beforeClosingToken.range[1]
    : openingBrace.range[1];
  const closingWhitespace = sourceCode.text.slice(
    closingWhitespaceStart,
    closingBrace.range[0],
  );
  const lines = sortedProperties.map((prop, index) => {
    const text = sourceCode.getText(prop);
    const needsComma = hasTrailingComma || index < sortedProperties.length - 1;
    return `${newline}${indent}${text}${(needsComma && ',') || ''}`;
  });
  return `${lines.join('')}${closingWhitespace}`;
}

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Ensure PostHogEvents union and object export stay sorted for predictable diffs',
    },
    schema: [],
    fixable: 'code',
    messages: {
      unsortedUnion:
        'PostHogEvent union members must be sorted alphabetically.',
      unsortedObject:
        'PostHogEvents object keys must be sorted alphabetically.',
    },
  },
  create(context) {
    if (!isTargetFile(context.getFilename())) {
      return {};
    }
    const sourceCode = context.getSourceCode();

    return {
      Program(node) {
        const typeAlias = node.body.find(
          (statement) =>
            statement.type === 'TSTypeAliasDeclaration' &&
            statement.id.name === 'PostHogEvent' &&
            statement.typeAnnotation.type === 'TSUnionType',
        );
        if (typeAlias) {
          const unionValues = getUnionValues(typeAlias.typeAnnotation);
          if (unionValues.length > 0 && !isSorted(unionValues)) {
            context.report({
              node: typeAlias,
              messageId: 'unsortedUnion',
              fix(fixer) {
                const unionType = typeAlias.typeAnnotation;
                if (
                  sourceCode.getCommentsInside(unionType).length > 0 ||
                  !unionType.types.every(isStringLiteralType)
                ) {
                  return null;
                }
                const sortedTexts = [...unionType.types]
                  .map((typeNode) => ({
                    value: typeNode.literal.value,
                    text: sourceCode.getText(typeNode),
                  }))
                  .sort((a, b) => a.value.localeCompare(b.value))
                  .map((entry) => entry.text);
                const replacement = buildSortedUnionText(
                  unionType,
                  sortedTexts,
                  sourceCode,
                );
                if (!replacement) {
                  return null;
                }
                return fixer.replaceTextRange(
                  [unionType.range[0], unionType.range[1]],
                  replacement,
                );
              },
            });
          }
        }

        const declaration = node.body.find(
          (statement) =>
            statement.type === 'ExportNamedDeclaration' &&
            statement.declaration &&
            statement.declaration.type === 'VariableDeclaration' &&
            statement.declaration.declarations.length === 1 &&
            statement.declaration.declarations[0].id.type === 'Identifier' &&
            statement.declaration.declarations[0].id.name === 'PostHogEvents',
        );

        if (declaration) {
          const init = declaration.declaration.declarations[0].init ?? null;
          const objectExpression = findObjectExpression(init);
          if (objectExpression) {
            const objectKeys = getObjectKeys(objectExpression);
            if (objectKeys.length > 0 && !isSorted(objectKeys)) {
              context.report({
                node: objectExpression,
                messageId: 'unsortedObject',
                fix(fixer) {
                  if (
                    sourceCode.getCommentsInside(objectExpression).length > 0
                  ) {
                    return null;
                  }
                  if (
                    objectExpression.loc.start.line ===
                    objectExpression.loc.end.line
                  ) {
                    return null;
                  }
                  const properties = objectExpression.properties;
                  if (
                    !properties.every(
                      (prop) =>
                        prop.type === 'Property' && getPropertyKey(prop),
                    )
                  ) {
                    return null;
                  }
                  const sortedProperties = [...properties].sort((a, b) => {
                    const keyA = getPropertyKey(a);
                    const keyB = getPropertyKey(b);
                    return keyA.localeCompare(keyB);
                  });
                  const replacement = buildSortedObjectText(
                    objectExpression,
                    sortedProperties,
                    sourceCode,
                  );
                  if (!replacement) {
                    return null;
                  }
                  const openingBrace =
                    sourceCode.getFirstToken(objectExpression);
                  const closingBrace =
                    sourceCode.getLastToken(objectExpression);
                  if (!openingBrace || !closingBrace) {
                    return null;
                  }
                  return fixer.replaceTextRange(
                    [openingBrace.range[1], closingBrace.range[0]],
                    replacement,
                  );
                },
              });
            }
          }
        }
      },
    };
  },
};
