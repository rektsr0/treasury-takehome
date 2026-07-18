from __future__ import annotations

import json
import subprocess
import textwrap
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run_node_json(script: str) -> dict:
    completed = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(completed.stdout)


def test_verify_application_record_pass_case() -> None:
    script = textwrap.dedent(
        """
        import { verifyApplicationRecord } from './src/lib/verification.ts';
        import { GOVERNMENT_WARNING } from './src/lib/constants.ts';

        const record = {
          id: '1',
          brandName: 'Old Tom Distillery',
          classType: 'Kentucky Straight Bourbon Whiskey',
          alcoholContent: '45% Alc./Vol. (90 Proof)',
          netContents: '750 mL',
          producer: 'Bottled by Old Tom Distillery, Frankfort, KY',
          countryOfOrigin: 'Product of USA',
          isReviewing: false,
        };

        const lines = [
          'OLD TOM DISTILLERY',
          'Kentucky Straight Bourbon Whiskey',
          '45% Alc./Vol. (90 Proof)',
          '750 mL',
          'Bottled by Old Tom Distillery, Frankfort, KY',
          'Product of USA',
          GOVERNMENT_WARNING,
        ];

        const result = verifyApplicationRecord(record, {
          text: lines.join('\\n'),
          lines,
          confidence: 97,
          durationMs: 812,
        });

        console.log(JSON.stringify(result));
        """
    )

    result = run_node_json(script)

    assert result["overall"] == "pass"
    assert result["failedCount"] == 0
    assert result["manualCount"] == 1
    assert any(
        check["key"] == "warningFormatting" and check["status"] == "manual"
        for check in result["checks"]
    )


def test_verify_application_record_fails_on_warning_heading_case() -> None:
    script = textwrap.dedent(
        """
        import { verifyApplicationRecord } from './src/lib/verification.ts';

        const record = {
          id: '1',
          brandName: 'Harbor Light Rum',
          classType: 'Premium Caribbean Rum',
          alcoholContent: '40% Alc./Vol. (80 Proof)',
          netContents: '750 mL',
          producer: 'Imported by Harbor Light Imports, Miami, FL',
          countryOfOrigin: 'Product of Jamaica',
          isReviewing: false,
        };

        const lines = [
          'Harbor Light Rum',
          'Premium Caribbean Rum',
          '40% Alc./Vol. (80 Proof)',
          '750 mL',
          'Imported by Harbor Light Imports, Miami, FL',
          'Product of Jamaica',
          'Government Warning: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.',
        ];

        const result = verifyApplicationRecord(record, {
          text: lines.join('\\n'),
          lines,
          confidence: 95,
          durationMs: 799,
        });

        console.log(JSON.stringify(result));
        """
    )

    result = run_node_json(script)

    assert result["overall"] == "attention"
    assert any(
        check["key"] == "warningText" and check["status"] == "fail"
        for check in result["checks"]
    )


def test_verify_application_record_fails_on_alcohol_mismatch() -> None:
    script = textwrap.dedent(
        """
        import { verifyApplicationRecord } from './src/lib/verification.ts';
        import { GOVERNMENT_WARNING } from './src/lib/constants.ts';

        const record = {
          id: '1',
          brandName: 'Harbor Light Rum',
          classType: 'Premium Caribbean Rum',
          alcoholContent: '40% Alc./Vol. (80 Proof)',
          netContents: '750 mL',
          producer: 'Imported by Harbor Light Imports, Miami, FL',
          countryOfOrigin: 'Product of Jamaica',
          isReviewing: false,
        };

        const lines = [
          'Harbor Light Rum',
          'Premium Caribbean Rum',
          '38% Alc./Vol. (76 Proof)',
          '750 mL',
          'Imported by Harbor Light Imports, Miami, FL',
          'Product of Jamaica',
          GOVERNMENT_WARNING,
        ];

        const result = verifyApplicationRecord(record, {
          text: lines.join('\\n'),
          lines,
          confidence: 94,
          durationMs: 733,
        });

        console.log(JSON.stringify(result));
        """
    )

    result = run_node_json(script)

    assert result["overall"] == "attention"
    assert any(
        check["key"] == "alcohol" and check["status"] == "fail"
        for check in result["checks"]
    )
