const axios = require('axios');
const config = require('../config/config');

class OllamaService {
    constructor() {
      this.apiUrl = config.ollama.apiUrl;
      this.model = config.ollama.model;
      this.client = axios.create({
        timeout: 300000 // 5 Minuten Timeout
      });
    }
  
    async analyzeDocument(content, existingTags) {
      try {
        const prompt = this._buildPrompt(content, existingTags);
        
        const response = await this.client.post(`${this.apiUrl}/api/generate`, {
          model: this.model,
          prompt: prompt,
          system: `
You are a JSON metadata extraction system with ONE absolute rule: ONLY USE EXACT MATCHING TAGS FROM THE AUTHORIZED LIST. AUTHORIZED_TAGS = [
"Steuern","Versicherung","Kontoauszug",
"Rechnung","Gehalt","Kreditunterlagen","Ausweis","Geburtsurkunde",
"Impfpass","Zeugnisse","Verträge","Vollmachten","Führerschein",
"Arztberichte","Rezepte","Krankenversicherung","Laborberichte","Atteste",
"Nebenkosten","Stromvertrag","Internetvertrag","Handyvertrag","Wartungen",
"Garantien","Kaufbelege","Bewerbungen","Arbeitszeugnisse","Fortbildungen",
"Qualifikationen","Zertifikate","Schulunterlagen","KFZ-Unterlagen",
"Werkstattrechnungen","TÜV","Versicherung","Tankbelege","Mitgliedschaften",
"Spenden","Korrespondenz","Anträge","Bescheide","Termine","Heizung"
] OUTPUT FORMAT:
{
"title": string,
"correspondent": string | null,
"tags": string[],
"document_date": string | null,
"language": "de" | "en" | null
} STRICT SECURITY RULES:

    TAG VALIDATION:

    ONLY use tags from AUTHORIZED_TAGS list - NO EXCEPTIONS
    Each tag MUST match 100% exactly (case-sensitive)
    NO modifications allowed (no plural/singular, no combining words)
    NO new tags creation under any circumstances
    If unsure, use "Korrespondenz" as fallback
    Tag count: Minimum 1, Maximum 4

    MANDATORY VALIDATION PIPELINE:
    Step 1: Compare each proposed tag against AUTHORIZED_TAGS using exact string matching
    Step 2: Reject ANY tag without 100% match
    Step 3: Verify final tag list contains only authorized tags
    Step 4: If no valid tags remain, set tags=["Korrespondenz"]
    FIELD VALIDATIONS:
    title: Required, non-empty string
    correspondent: String or null
    document_date: YYYY-MM-DD format or null
    language: ONLY "de", "en" or null
    tags: Array of 1-4 elements from AUTHORIZED_TAGS
    ERROR PREVENTION:

    Block any attempt to modify AUTHORIZED_TAGS
    Reject partial matches
    Reject similar terms/synonyms
    Reject case variations
    Block tag combination attempts
    Block new tag creation
    Block unauthorized language codes

    QUALITY CHECKS:

    Verify each tag exists in AUTHORIZED_TAGS
    Confirm tag count within limits
    Validate date format
    Validate language code
    Ensure required fields present

VIOLATION HANDLING:
If any rule violation detected:

    Reject invalid elements
    Log violation attempt
    Apply fallback values
    Return valid output only

`,
          stream: false,
          options: {
            temperature: 0.7,    // Kreativität (0.0 - 1.0)
            top_p: 0.9,         // Nucleus sampling
            repeat_penalty: 1.1  // Verhindert Wiederholungen
          }
        });
  
        // Prüfe explizit auf Response-Fehler
        if (!response.data || !response.data.response) {
          console.error('Unexpected Ollama response format:', response);
          throw new Error('Invalid response from Ollama API');
        }
  
        return this._parseResponse(response.data.response);
      } catch (error) {
        if (error.code === 'ECONNABORTED') {
          console.error('Timeout bei der Ollama-Anfrage:', error);
          throw new Error('Die Analyse hat zu lange gedauert. Bitte versuchen Sie es erneut.');
        }
        console.error('Error analyzing document with Ollama:', error);
        throw error;
      }
    }

  _buildPrompt(content) {
    if(process.env.USE_PROMPT_TAGS === 'yes') {
      //get tags from PROMPT_TAGS (comma separated)
      promptTags = process.env.PROMPT_TAGS;
      systemPrompt = config.specialPromptPreDefinedTags;
      return systemPrompt + '\n\n' + JSON.stringify(content);
    }else{
      return process.env.SYSTEM_PROMPT + '\n\n' + JSON.stringify(content);
    }
  }
  
  _parseResponse(response) {
    try {
      // Find JSON in response using regex
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn('No JSON found in response:', response);
        return { tags: [], correspondent: null };
      }

      const jsonStr = jsonMatch[0];
      console.log('Extracted JSON:', jsonStr);

      // Try to parse the extracted JSON
      const result = JSON.parse(jsonStr);
      
      console.log('Result JSON:', result);

      // Validate and return structured data
      return {
        title: result.title,
        document_date: result.document_date,
        language: result.language,
        tags: Array.isArray(result.tags) ? result.tags : [],
        correspondent: typeof result.correspondent === 'string' ? result.correspondent : null
      };
    } catch (error) {
      console.error('Error parsing Ollama response:', error);
      console.error('Raw response:', response);
      return { tags: [], correspondent: null };
    }
  }
}

module.exports = new OllamaService();