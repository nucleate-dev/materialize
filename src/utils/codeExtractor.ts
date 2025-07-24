import { CodeBlock, CodeExtractionResult, SnackFiles } from '../types/chat';

export function extractCodeFromMessage(message: string): CodeExtractionResult {
  const codeBlocks: CodeBlock[] = [];

  // Regex to match code blocks with optional language specification
  const codeBlockRegex = /```(?:(javascript|js|typescript|ts|jsx|tsx))?\n([\s\S]*?)```/g;

  let match;
  while ((match = codeBlockRegex.exec(message)) !== null) {
    const language = match[1];
    const code = match[2].trim();

    if (code) {
      // Determine language, default to javascript if not specified
      let detectedLanguage: 'javascript' | 'typescript' = 'javascript';

      if (language === 'typescript' || language === 'ts' || language === 'tsx') {
        detectedLanguage = 'typescript';
      } else if (language === 'javascript' || language === 'js' || language === 'jsx' || !language) {
        detectedLanguage = 'javascript';
      }

      // Try to detect if it's a React Native component
      if (isReactNativeCode(code)) {
        codeBlocks.push({
          language: detectedLanguage,
          code: cleanupCode(code),
          fileName: getFileNameFromCode(code, detectedLanguage),
        });
      }
    }
  }

  return {
    hasCode: codeBlocks.length > 0,
    codeBlocks,
    message,
  };
}

function isReactNativeCode(code: string): boolean {
  // Check for React Native specific imports or components
  const reactNativeIndicators = [
    'react-native',
    'StyleSheet',
    'View',
    'Text',
    'TouchableOpacity',
    'ScrollView',
    'FlatList',
    'Image',
    'TextInput',
    'from \'react\'',
    'import React',
    'export default',
    // JSX patterns
    '<View',
    '<Text',
    '<TouchableOpacity',
    '<ScrollView',
    '<FlatList',
    '<Image',
    '<TextInput',
    // Common React patterns that indicate this is likely React/React Native code
    'useState',
    'useEffect',
    'function ',
    'const ',
    '=> {',
    'return (',
    'backgroundColor:',
    'style={',
    'styles.',
    'expo-linear-gradient',
    'react-native-vector-icons',
    'react-native-safe-area-context',
    'expo-router',
  ];

  // If it contains multiple indicators or looks like a complete component, it's likely React Native
  const matchCount = reactNativeIndicators.filter(indicator => code.includes(indicator)).length;

  // More lenient: if it has at least 1 indicator or contains JSX-like syntax, consider it valid code
  // This is less restrictive to ensure code blocks aren't filtered out when useGranularEdits is false
  return matchCount >= 1 ||
    code.includes('<') && code.includes('>') ||
    code.includes('export default') ||
    code.includes('function ') ||
    code.includes('const ') ||
    code.includes('import ') ||
    code.trim().length > 20; // Include any substantial code block
}

function cleanupCode(code: string): string {
  // Remove any leading/trailing whitespace
  let cleaned = code.trim();

  // Check if this looks like a React component that needs imports
  const needsReactImport = !cleaned.includes('import React') &&
    (cleaned.includes('export default') || cleaned.includes('function ') || cleaned.includes('const '));

  // Ensure proper imports for React Native
  if (needsReactImport) {
    cleaned = `import React from 'react';\n${cleaned}`;
  }

  // Collect React Native components that need importing
  const rnComponents: string[] = [];
  const componentChecks = [
    { component: 'View', pattern: '<View' },
    { component: 'Text', pattern: '<Text' },
    { component: 'TouchableOpacity', pattern: '<TouchableOpacity' },
    { component: 'ScrollView', pattern: '<ScrollView' },
    { component: 'FlatList', pattern: '<FlatList' },
    { component: 'Image', pattern: '<Image' },
    { component: 'TextInput', pattern: '<TextInput' },
    { component: 'StyleSheet', pattern: 'StyleSheet.create' },
  ];

  componentChecks.forEach(({ component, pattern }) => {
    if (cleaned.includes(pattern) && !cleaned.includes(`import.*${component}`)) {
      rnComponents.push(component);
    }
  });

  // Add React Native imports if needed
  if (rnComponents.length > 0 && !cleaned.includes('from \'react-native\'')) {
    const importLine = `import { ${rnComponents.join(', ')} } from 'react-native';`;
    if (cleaned.includes('import React from \'react\';')) {
      cleaned = cleaned.replace(
        'import React from \'react\';',
        `import React from 'react';\n${importLine}`
      );
    } else {
      cleaned = `${importLine}\n${cleaned}`;
    }
  }

  return cleaned;
}

function getFileNameFromCode(code: string, language: 'javascript' | 'typescript'): string {
  // Try to extract component name from export default
  const exportMatch = code.match(/export default (?:function\s+)?(\w+)/);
  if (exportMatch) {
    const componentName = exportMatch[1];
    const extension = language === 'typescript' ? 'tsx' : 'js';
    return `${componentName}.${extension}`;
  }

  // Default filename
  const extension = language === 'typescript' ? 'tsx' : 'js';
  return `App.${extension}`;
}

export function updateSnackFiles(currentFiles: SnackFiles, codeBlocks: CodeBlock[]): SnackFiles {
  // Create a deep copy of the current files
  const newFiles = JSON.parse(JSON.stringify(currentFiles));

  codeBlocks.forEach((block) => {
    const fileName = block.fileName || 'App.js';
    newFiles[fileName] = {
      contents: block.code,
      type: 'CODE',
    };
  });

  return newFiles;
}