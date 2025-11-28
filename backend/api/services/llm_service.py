from google import genai
from google.genai import types
from django.conf import settings
import json
import logging

logger = logging.getLogger(__name__)


class LLMService:
    def __init__(self):
        self.client = genai.Client(api_key=settings.GOOGLE_API_KEY)

    def analyze_code(self, mr_title, mr_description, changes):
        """
        Анализирует изменения кода с помощью Gemini 2.5 Flash.
        Возвращает строго JSON со summary и issues.
        """
        if not changes:
            return None

        # Собираем контекст из diff-ов
        diff_context = ""
        for change in changes.get("changes", [])[:20]:  # ограничим 20 файлами
            diff_context += (
                f"\nFile: {change.get('new_path') or change.get('old_path')}\n"
                f"Diff:\n{change.get('diff')}\n"
            )

        prompt = f"""
You are a Senior Code Reviewer in a large enterprise bank.

Analyze the following Merge Request.

Title: {mr_title}
Description: {mr_description}

Changes (unified diff format):
{diff_context}

Return ONLY JSON, no extra text.

Requirements:
- Check code quality, architecture, readability, performance and security risks.
- Focus on real issues, avoid nitpicking.
- For EACH issue, you MUST provide a concrete suggested_fix:
  - either a small code snippet (preferred),
  - or a precise step-by-step instruction what to change.
- Do NOT leave suggested_fix empty. If you truly cannot propose exact code,
  write a clear textual plan as suggested_fix.

Response JSON schema:
{{
  "summary": {{
    "recommendation": "merge" | "needs_fixes" | "reject",
    "confidence": number (0.0-1.0),
    "short_text": string
  }},
  "issues": [
    {{
      "file_path": string,
      "line_number": integer | null,
      "severity": "INFO" | "WARNING" | "ERROR" | "CRITICAL",
      "message": string,
      "suggested_fix": string
    }}
  ]
}}
"""

        try:
            response = self.client.models.generate_content(
                model="gemini-2.0-flash",
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema={
                        "type": "OBJECT",
                        "properties": {
                            "summary": {
                                "type": "OBJECT",
                                "properties": {
                                    "recommendation": {
                                        "type": "STRING",
                                        "enum": ["merge", "needs_fixes", "reject"],
                                    },
                                    "confidence": {"type": "NUMBER"},
                                    "short_text": {"type": "STRING"},
                                },
                                "required": ["recommendation", "confidence", "short_text"],
                            },
                            "issues": {
                                "type": "ARRAY",
                                "items": {
                                    "type": "OBJECT",
                                    "properties": {
                                        "file_path": {"type": "STRING"},
                                        "line_number": {"type": "INTEGER"},
                                        "severity": {
                                            "type": "STRING",
                                            "enum": ["INFO", "WARNING", "ERROR", "CRITICAL"],
                                        },
                                        "message": {"type": "STRING"},
                                        "suggested_fix": {"type": "STRING"},
                                        "rule": {"type": "STRING"},
                                    },
                                    # 👇 теперь suggested_fix обязателен
                                    "required": ["file_path", "severity", "message", "suggested_fix"],
                                },
                            },
                        },
                        "required": ["summary", "issues"],
                    },
                ),
            )

            # response.text уже должен быть чистым JSON
            data = json.loads(response.text)

            # Подстрахуемся: если вдруг где-то нет suggested_fix — вставим заглушку
            for issue in data.get("issues", []):
                if not issue.get("suggested_fix"):
                    issue["suggested_fix"] = "No concrete fix suggested by AI. Please review this issue manually."

            logger.info("LLM analysis result: %s", json.dumps(data, ensure_ascii=False)[:2000])
            return data

        except Exception as e:
            logger.error(f"LLM Analysis failed: {e}")
            return None
