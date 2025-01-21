import * as vscode from 'vscode';
import OpenAI from 'openai';
import { JSON_REQUEST_MODEL, JSON_REQUEST_SYSTEM_PROMPT } from './constant';

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: ''
});

export function activate(context: vscode.ExtensionContext) {
    // Modified generate JSON command that uses stored variables
    let generateJsonDisposable = vscode.commands.registerCommand('cloudy.generateDummyRequest', async () => {
        const editor = vscode.window.activeTextEditor;
        
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found');
            return;
        }

        const selection = editor.selection;
        const selectedText = editor.document.getText(selection);

        if (!selectedText) {
            vscode.window.showErrorMessage('No text selected');
            return;
        }

        const config = vscode.workspace.getConfiguration('cloudy');
        let openaiApiKey = config.get<string>('openaiKey');

        if (!openaiApiKey) {
            openaiApiKey = await promptForApiKey();
        }

        if (openaiApiKey === undefined) {
            vscode.window.showInformationMessage(`Please set up OpenAI API key.`);
            return;
        }

        openai.apiKey = openaiApiKey;

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Generating JSON...",
                cancellable: false
            }, async () => {
                // Call OpenAI API
                const completion = await openai.chat.completions.create({
                    messages: [
                        {
                            role: "system",
                            content: JSON_REQUEST_SYSTEM_PROMPT,
                        },
                        {
                            role: "user",
                            content: `Convert this code structure into JSON with dummy data: ${selectedText}`
                        }
                    ],
                    model: JSON_REQUEST_MODEL,
                });

                let jsonResponse = completion.choices[0].message.content || '';
                jsonResponse = jsonResponse.replace('```json', '').replace('```', '');

                // Replace variables in the response
                const variables = context.globalState.get('variables', {});
                Object.entries(variables).forEach(([key, value]) => {
                    // Use regex to replace the key with its value in the JSON
                    const regex = new RegExp(`"${key}":\\s*"[^"]*"`, 'g');
                    jsonResponse = jsonResponse.replace(regex, `"${key}": "${value}"`);
                });

                try {
                    // Format the JSON
                    const formattedJson = JSON.stringify(JSON.parse(jsonResponse), null, 2);

                    // Create an untitled JSON document
                    const document = await vscode.workspace.openTextDocument({
                        content: formattedJson,
                        language: 'json'
                    });

                    // Show the document in a new editor group
                    await vscode.window.showTextDocument(document, {
                        viewColumn: vscode.ViewColumn.Beside,
                        preview: true
                    });
                } catch (parseError) {
                    vscode.window.showErrorMessage('Error processing request');
                    
                    // If JSON parsing fails, still show the raw response
                    const document = await vscode.workspace.openTextDocument({
                        content: jsonResponse,
                        language: 'text'
                    });
                    await vscode.window.showTextDocument(document, {
                        viewColumn: vscode.ViewColumn.Beside,
                        preview: true
                    });
                }
            });

        } catch (error) {
            vscode.window.showErrorMessage('Error processing request');
        }
    });


    // Command to save a variable
    let saveVarDisposable = vscode.commands.registerCommand('cloudy.saveVariable', async () => {
        const editor = vscode.window.activeTextEditor;
        
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found');
            return;
        }

        const selection = editor.selection;
        const selectedText = editor.document.getText(selection).trim();

        if (!selectedText) {
            vscode.window.showErrorMessage('No text selected');
            return;
        }

        // Ask user for the value
        const value = await vscode.window.showInputBox({
            prompt: `Enter value for "${selectedText}"`,
            placeHolder: 'Value'
        });

        if (value !== undefined) {
            // Get existing variables
            const variables: { [key: string]: string } = context.globalState.get('variables', {});
            // Add new variable
            variables[selectedText] = value;
            // Save back to persistent storage
            await context.globalState.update('variables', variables);
            vscode.window.showInformationMessage(`Saved "${selectedText}" = "${value}"`);
        }
    });

    // Command to remove variables
    let removeVarDisposable = vscode.commands.registerCommand('cloudy.removeVariable', async () => {
        const variables: { [key: string]: string } = context.globalState.get('variables', {});
        const keys = Object.keys(variables) as Array<keyof typeof variables>;

        if (keys.length === 0) {
            vscode.window.showInformationMessage('No variables stored');
            return;
        }

        // Create QuickPick items for each variable
        const items = keys.map(key => ({
            label: String(key), // Convert key to a string
            description: variables[key],
            detail: 'Click to remove this variable'
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a variable to remove',
            canPickMany: false
        });

        if (selected) {
            delete variables[selected.label];
            await context.globalState.update('variables', variables);
            vscode.window.showInformationMessage(`Removed variable "${selected.label}"`);
        }
    });

    // Command to list all variables
    let listVarsDisposable = vscode.commands.registerCommand('cloudy.listVariables', async () => {
        const variables = context.globalState.get('variables', {});
        
        if (Object.keys(variables).length === 0) {
            vscode.window.showInformationMessage('No variables stored');
            return;
        }

        // Create and show a new text document with the variables
        const content = Object.entries(variables)
            .map(([key, value]) => `${key} = ${value}`)
            .join('\n');

        const document = await vscode.workspace.openTextDocument({
            content,
            language: 'text'
        });

        await vscode.window.showTextDocument(document, {
            viewColumn: vscode.ViewColumn.Beside,
            preview: true
        });
    });

    // Register all commands
    context.subscriptions.push(generateJsonDisposable);
    context.subscriptions.push(saveVarDisposable);
    context.subscriptions.push(removeVarDisposable);
    context.subscriptions.push(listVarsDisposable);
}

export async function promptForApiKey(): Promise<string | undefined> {
    const signupURL = 'https://platform.openai.com/signup';
    const result = await vscode.window.showInputBox({
        prompt: `Set your OpenAI API Key on VSCode. Don't have one? [Get it here](${signupURL})`,
        password: true,
        placeHolder: 'Paste your API key here',
        ignoreFocusOut: true,
        validateInput: (value) => {
            if (!value) {
                return 'API key cannot be empty';
            }
            return null;
        }
    });

    if (!result) {
        return undefined; // User cancelled the input
    }

    // User entered an API key
    await vscode.workspace.getConfiguration('cloudy').update('openaiKey', result, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(`OpenAI API Key has been set successfully.`);
    return result;
}

export function deactivate() {}