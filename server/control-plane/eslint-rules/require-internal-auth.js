/**
 * ESLint rule: require-internal-auth
 *
 * Enforces that all routes defined in internal-services directory
 * must include the authenticateInternalToolsRequest preHandler
 */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require authenticateInternalToolsRequest preHandler for internal service routes',
      category: 'Security',
      recommended: true
    },
    fixable: null,
    schema: []
  },

  create(context) {
    const filename = context.getFilename();

    // Only apply this rule to files in internal-services directory
    if (!filename.includes('/internal-services/') && !filename.includes('\\internal-services\\')) {
      return {};
    }

    return {
      // Look for Fastify route method calls (app.get, app.post, app.put, app.delete, etc.)
      CallExpression(node) {
        // Check if it's a route registration call
        if (
          node.callee &&
          node.callee.type === 'MemberExpression' &&
          node.callee.object &&
          node.callee.object.name === 'app' &&
          node.callee.property &&
          ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'].includes(node.callee.property.name)
        ) {
          const httpMethod = node.callee.property.name;

          // Route registration should have at least 2 arguments: (path, options/handler, handler?)
          if (node.arguments.length < 2) {
            return;
          }

          let optionsArg = null;
          let hasAuthPreHandler = false;

          // Check if second argument is options object or direct handler
          if (node.arguments[1] && node.arguments[1].type === 'ObjectExpression') {
            optionsArg = node.arguments[1];
          }

          if (optionsArg) {
            // Look for preHandler in options
            for (const property of optionsArg.properties) {
              if (
                property.type === 'Property' &&
                property.key &&
                property.key.name === 'preHandler'
              ) {
                // Check if preHandler is authenticateInternalToolsRequest
                if (
                  property.value &&
                  property.value.type === 'Identifier' &&
                  property.value.name === 'authenticateInternalToolsRequest'
                ) {
                  hasAuthPreHandler = true;
                }

                // Handle array of preHandlers
                if (
                  property.value &&
                  property.value.type === 'ArrayExpression'
                ) {
                  for (const element of property.value.elements) {
                    if (
                      element &&
                      element.type === 'Identifier' &&
                      element.name === 'authenticateInternalToolsRequest'
                    ) {
                      hasAuthPreHandler = true;
                      break;
                    }
                  }
                }
                break;
              }
            }
          }

          // Report error if no authentication preHandler found
          if (!hasAuthPreHandler) {
            context.report({
              node,
              message: `Route ${httpMethod.toUpperCase()} in internal-services must include 'authenticateInternalToolsRequest' as preHandler for security. Add: preHandler: authenticateInternalToolsRequest`
            });
          }
        }
      }
    };
  }
};