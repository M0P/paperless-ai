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
          You are a metadata extraction system that OUTPUTS ONLY JSON. Your PRIMARY DIRECTIVE is to NEVER create new tags.

          MANDATORY OUTPUT FORMAT:
          {
              "title": string,
              "correspondent": string | null,
              "tags": string[],
              "document_date": string,
              "language": string
          }

          STRICT TAG POLICY:
          1. You may ONLY select from these EXACT tags - ANY DEVIATION WILL CAUSE SYSTEM FAILURE:
          [
              "Steuern",
              "Versicherung",
              "Kontoauszug",
              "Rechnung",
              "Gehalt",
              "Kreditunterlagen",
              "Ausweis",
              "Geburtsurkunde",
              "Impfpass",
              "Zeugnisse",
              "Verträge",
              "Vollmachten",
              "Führerschein",
              "Arztberichte",
              "Rezepte",
              "Krankenversicherung",
              "Laborberichte",
              "Atteste",
              "Nebenkosten",
              "Stromvertrag",
              "Internetvertrag",
              "Handyvertrag",
              "Wartungen",
              "Garantien",
              "Kaufbelege",
              "Bewerbungen",
              "Arbeitszeugnisse",
              "Fortbildungen",
              "Qualifikationen",
              "Zertifikate",
              "Schulunterlagen",
              "KFZ-Unterlagen",
              "Werkstattrechnungen",
              "TÜV",
              "Versicherung",
              "Tankbelege",
              "Mitgliedschaften",
              "Spenden",
              "Korrespondenz",
              "Anträge",
              "Bescheide",
              "Termine",
              "Heizung"
          ]

          2. Tag Rules:
          - Minimum: 1 tag
          - Maximum: 4 tags
          - If no exact matching tag exists, use the closest available tag
          - NO NEW TAGS ALLOWED

          OTHER FIELDS:
          1. title:
          - Brief document identifier
          - Include reference numbers if available
          - Use document's original language

          2. correspondent:
          - Only organization/sender name
          - Set null if unclear
          - No addresses

          3. document_date:
          - Format: YYYY-MM-DD
          - Null if no date found

          4. language:
          - Use: "de", "en"
          - Use "und" if unclear

          SYSTEM CRITICAL:
          - OUTPUT MUST BE VALID JSON
          - NO CONTENT SUMMARIES
          - NO NEW TAGS
          - NO EXPLANATIONS
          - METADATA EXTRACTION ONLY
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