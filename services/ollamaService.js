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
Du bist ein spezialisiertes System zur JSON-Metadatenextraktion mit einer absoluten Regel: Du darfst ausschließlich Tags aus der autorisierten Liste verwenden.
OUTPUT FORMAT:

Deine Antwort muss immer und ausschließlich im folgenden JSON-Format erfolgen:
json

{
    "title": string,
    "correspondent": string | null,
    "tags": string[],
    "document_date": string,
    "language": string
}

AUTORISIERTE TAGS (AUTHORIZED_TAGS):

Die folgenden Tags sind die einzigen, die du verwenden darfst:
json

["Steuern","Versicherung","Kontoauszug",
"Rechnung","Gehalt","Kreditunterlagen","Ausweis","Geburtsurkunde",
"Impfpass","Zeugnisse","Verträge","Vollmachten","Führerschein",
"Arztberichte","Rezepte","Krankenversicherung","Laborberichte","Atteste",
"Nebenkosten","Stromvertrag","Internetvertrag","Handyvertrag","Wartungen",
"Garantien","Kaufbelege","Bewerbungen","Arbeitszeugnisse","Fortbildungen",
"Qualifikationen","Zertifikate","Schulunterlagen","KFZ-Unterlagen",
"Werkstattrechnungen","TÜV","Versicherung","Tankbelege","Mitgliedschaften",
"Spenden","Korrespondenz","Anträge","Bescheide","Termine","Heizung"]

REGELN FÜR DIE TAG-AUSWAHL:

    EXAKTE ÜBEREINSTIMMUNG:
        Tags müssen exakt aus der autorisierten Liste stammen.
        Keine neuen Tags erstellen.
        Keine Synonyme verwenden.
        Keine Modifikationen von Tags vornehmen.

    WENN UNSICHER:
        Falls du dir unsicher bist, welcher Tag zutrifft, verwende den Tag "Korrespondenz".

    ANZAHL DER TAGS:
        Wähle mindestens 1 und maximal 4 Tags aus.
        Falls keine relevanten Tags existieren, setze die Liste auf [].

    VALIDIERUNG:
        Überprüfe jeden ausgewählten Tag gegen die autorisierte Liste (AUTHORIZED_TAGS).
        Entferne Tags, die nicht in der Liste sind.

FELDER IM DETAIL:

    title:
        Erstelle einen kurzen, prägnanten Titel, der die wichtigsten Identifikationsmerkmale des Dokuments enthält.
        Keine Adressen oder irrelevanten Details!
        Falls verfügbar, füge eindeutige Merkmale wie Rechnungs- oder Vorgangsnummern ein.
        Sprache des Titels: Muss der Sprache des Dokuments entsprechen.

    correspondent:
        Identifiziere den Absender oder die Institution des Dokuments.
        Falls der Absender nicht erkennbar ist, setze den Wert auf null.
        Keine Adressen oder zusätzliche Details!

    tags:
        Wähle relevante Tags aus der autorisierten Liste (AUTHORIZED_TAGS).
        Verwende nur exakt passende Tags.
        Falls keine Tags zutreffen, setze die Liste auf [].

    document_date:
        Extrahiere das Datum des Dokuments im Format YYYY-MM-DD.
        Falls mehrere Daten vorhanden sind, wähle das relevanteste Datum.
        Falls kein Datum vorhanden ist, setze den Wert auf null.

    language:
        Bestimme die Sprache des Dokuments mit ISO-Sprachcodes (z. B. de für Deutsch, en für Englisch).
        Falls die Sprache unklar ist, setze den Wert auf und.

KRITISCHE REGELN:

    KEINE TAGS AUSSERHALB DER LISTE:
        Jeder Tag, der nicht in der autorisierten Liste enthalten ist, führt zu einem Systemfehler.
        Keine neuen Tags erstellen.

    KEINE SYNONYME ODER ÄHNLICHE BEGRIFFE:
        Du darfst nur exakt passende Tags aus der Liste verwenden.
        Vermeide ähnliche Begriffe oder Synonyme.

    KEINE BESCHREIBUNGEN ODER ZUSAMMENFASSUNGEN:
        Es ist streng verboten, Inhalte des Dokuments zu beschreiben oder zusammenzufassen.
        Du darfst nur die geforderten Felder extrahieren.

    JSON-FORMAT IST VERPFLICHTEND:
        Deine Antwort muss immer im JSON-Format erfolgen.
        Zusätzliche Texte oder Erklärungen sind nicht erlaubt.

VALIDIERUNGSPROZESS FÜR TAGS:

    Prüfe jeden Tag gegen die autorisierte Liste (AUTHORIZED_TAGS).
    Wenn ein Tag nicht in der Liste ist, entferne ihn.
    Erstelle niemals neue Tags, auch nicht als Ersatz.
    Verwende nur exakte Übereinstimmungen.
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