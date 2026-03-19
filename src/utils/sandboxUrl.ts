export const sandboxHtml = `<!DOCTYPE html>
<html>
  <body>
    <script>
      function prependOutputToAssignments(script) {
        if (typeof script !== 'string') return '';

        return script
          .split('\\n')
          .map((line) => {
            const trimmed = line.trim();

            // Skip lines with variable declarations
            if (/^\\s*(var|let|const)\\s+/.test(trimmed)) {
              return line;
            }

            // Rewrite plain assignments like: foo = bar;
            return line.replace(
              /^(\\s*)([a-zA-Z_$][\\w$]*)\\s*=\\s*/,
              (match, indent, varName) => {
                // Avoid rewriting \`output =\` or already namespaced values like \`foo.bar =\`
                if (varName === 'output' || varName.includes('.')) {
                  return match;
                }
                return \`\${indent}output.\${varName} =\`;
              }
            );
          })
          .join('\\n');
      }

      window.addEventListener("message", (event) => {
        const { script, inputs } = event.data;

        try {
          let output = {};
          let sandbox = { ...inputs, output };

          const keys = Object.keys(sandbox);
          const values = Object.values(sandbox);

          if (typeof script !== 'string') {
            throw new Error('No script provided or script is not a string');
          }

          const safeScript = prependOutputToAssignments(script);
          console.log('Safe script:', safeScript);

          const fn = new Function(...keys, safeScript + "; return output;");
          const result = fn(...values);

          parent.postMessage({ type: "RESULT", result }, "*");
        } catch (err) {
          parent.postMessage({ type: "ERROR", error: err.message }, "*");
        }
      });
    </script>
  </body>
</html>`;

let blobUrl: string | null = null;

export function getSandboxUrl(): string {
  if (blobUrl) return blobUrl;

  const blob = new Blob([sandboxHtml], { type: 'text/html' });
  blobUrl = URL.createObjectURL(blob);
  return blobUrl;
}