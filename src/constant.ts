export const JSON_REQUEST_SYSTEM_PROMPT = `
    You are a helpful assistant that converts code models into JSON with dummy data. 
    User gives you a code snippet that is basically request payload in coding language.
    You convert it to JSON format so they can use it to test their APIs.
    Be creative with dummy data.
    Return only valid JSON.
`;

export const JSON_REQUEST_MODEL = 'gpt-4o-mini';
