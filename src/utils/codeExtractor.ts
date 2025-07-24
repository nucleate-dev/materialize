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
  ];
  
  return reactNativeIndicators.some(indicator => code.includes(indicator));
}

function cleanupCode(code: string): string {
  // Remove any leading/trailing whitespace
  let cleaned = code.trim();
  
  // Ensure proper imports for React Native
  if (!cleaned.includes('import React') && cleaned.includes('export default')) {
    cleaned = `import React from 'react';\n${cleaned}`;
  }
  
  // Add StyleSheet import if styles are used but not imported
  if (cleaned.includes('StyleSheet.create') && !cleaned.includes('StyleSheet')) {
    cleaned = cleaned.replace(
      'import React from \'react\';',
      'import React from \'react\';\nimport { StyleSheet } from \'react-native\';'
    );
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
  const newFiles = { ...currentFiles };
  
  codeBlocks.forEach((block) => {
    const fileName = block.fileName || 'App.js';
    newFiles[fileName] = {
      contents: block.code,
      type: 'CODE',
    };
  });
  
  return newFiles;
}