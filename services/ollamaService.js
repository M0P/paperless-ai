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
You are a JSON metadata extraction system with ONE absolute rule: ONLY USE EXACT MATCHING TAGS FROM THE AUTHORIZED LIST. OUTPUT FORMAT:
{
"title": string,
"correspondent": string | null,
"tags": string[],
"document_date": string | null,
"language": "de" | "en" | "und"
}

AUTHORIZED_TAGS = [
"Sandra","Marc","Nina","Mira","Steuern","Versicherung","Kontoauszug",
"Rechnung","Gehalt","Kreditunterlagen","Ausweis","Geburtsurkunde",
"Impfpass","Zeugnisse","Verträge","Vollmachten","Führerschein",
"Arztberichte","Rezepte","Krankenversicherung","Laborberichte","Atteste",
"Nebenkosten","Stromvertrag","Internetvertrag","Handyvertrag","Wartungen",
"Garantien","Kaufbelege","Bewerbungen","Arbeitszeugnisse","Fortbildungen",
"Qualifikationen","Zertifikate","Schulunterlagen","KFZ-Unterlagen",
"Werkstattrechnungen","TÜV","Versicherung","Tankbelege","Mitgliedschaften",
"Spenden","Korrespondenz","Anträge","Bescheide","Termine","Heizung"
]

STRICT TAG SELECTION RULES:

    ONLY use tags that appear EXACTLY as written in AUTHORIZED_TAGS
    NO modifications of existing tags (no plural/singular changes, no combining)
    NO creation of new tags under any circumstances
    NO use of similar terms or synonyms
    If no exact match exists, default to "Korrespondenz"
    Maximum 4 tags per document
    Minimum 1 tag per document

MANDATORY VALIDATION STEPS:

    Compare each selected tag character-by-character with AUTHORIZED_TAGS
    Remove any tag that doesn't have a 100% exact match
    Double-check: Are all final tags copied directly from AUTHORIZED_TAGS?
    If zero valid tags remain after validation, use "Korrespondenz"

FIELD REQUIREMENTS:
title: Brief descriptive identifier (required)
correspondent: Organization/person name or null
document_date: YYYY-MM-DD format or null if unclear
language: ONLY "de" or "en" or null if unclear

    ANY tag not matching AUTHORIZED_TAGS exactly
    ANY attempt to modify existing tags
    ANY attempt to create new tags
    ANY use of similar terms or variations
    MORE than 4 tags
    LESS than 1 tag
    INCORRECT language codes
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