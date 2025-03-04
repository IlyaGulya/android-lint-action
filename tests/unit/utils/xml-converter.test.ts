import * as fs from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { XmlConverter } from "@/src/utils/xml-converter";

// Read the actual fixture file content before mocking fs
const fixtureFilePath = path.resolve(__dirname, "../../fixtures/issues.xml");
const fixtureContent = fs.readFileSync(fixtureFilePath, "utf8");

// Mock fs module
vi.mock("fs", async () => {
  const actual = await vi.importActual("fs");
  return {
    ...actual,
    default: {
      ...actual,
      promises: {
        readFile: vi.fn(),
        writeFile: vi.fn(),
      },
    },
    promises: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
    },
  };
});

describe("XmlConverter", () => {
  let xmlConverter: XmlConverter;

  beforeEach(() => {
    vi.clearAllMocks();
    xmlConverter = new XmlConverter();

    // Mock environment variables
    vi.stubEnv("RUNNER_WORKSPACE", "/workspace");
    vi.stubEnv("GITHUB_REPOSITORY", "owner/repo");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("convertLintToCheckstyle", () => {
    it("should create empty checkstyle file when no issues exist", async () => {
      // Mock reading empty lint XML
      const emptyXml = `<?xml version="1.0" encoding="utf-8"?><issues></issues>`;
      vi.mocked(fs.promises.readFile).mockResolvedValueOnce(emptyXml);

      // Call the converter
      await xmlConverter.convertLintToCheckstyle("input.xml", "output.xml");

      // Verify the output
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        "output.xml",
        expect.stringContaining('<?xml version="1.0" encoding="utf8"?>'),
      );
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        "output.xml",
        expect.stringContaining('<checkstyle version="8.0"/>'),
      );
    });

    it("should convert lint issues to checkstyle format", async () => {
      // Mock reading lint XML with issues
      const lintXml = `<?xml version="1.0" encoding="utf-8"?><issues><issue id="UnusedResources" severity="warning" message="The resource R.string.app_name appears to be unused" category="Performance"><location file="/workspace/repo/app/src/main/res/values/strings.xml" line="2" column="4"/></issue></issues>`;
      vi.mocked(fs.promises.readFile).mockResolvedValueOnce(lintXml);

      // Call the converter
      await xmlConverter.convertLintToCheckstyle("input.xml", "output.xml");

      // Verify the output
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        "output.xml",
        expect.stringContaining("app/src/main/res/values/strings.xml"),
      );
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        "output.xml",
        expect.stringContaining('line="2"'),
      );
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        "output.xml",
        expect.stringContaining('column="4"'),
      );
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        "output.xml",
        expect.stringContaining('severity="warning"'),
      );
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        "output.xml",
        expect.stringContaining(
          "UnusedResources: The resource R.string.app_name appears to be unused",
        ),
      );
    });

    it("should skip issues from .gradle/caches directory", async () => {
      // Mock reading lint XML with gradle cache issue
      const lintXml = `<?xml version="1.0" encoding="utf-8"?><issues><issue id="GradleDependency" severity="warning" message="A newer version of com.android.tools.build:gradle is available"><location file="/workspace/repo/.gradle/caches/build.gradle" line="1" column="1"/></issue></issues>`;
      vi.mocked(fs.promises.readFile).mockResolvedValueOnce(lintXml);

      // Call the converter
      await xmlConverter.convertLintToCheckstyle("input.xml", "output.xml");

      // Verify the output doesn't contain the gradle cache issue
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        "output.xml",
        expect.not.stringContaining(".gradle/caches"),
      );
    });

    it("should handle missing location attributes", async () => {
      // Mock reading lint XML with missing location attributes
      const lintXml = `<?xml version="1.0" encoding="utf-8"?><issues><issue id="MissingLocation" severity="warning" message="Test message"><location file="/workspace/repo/app/src/main/java/Test.java"/></issue></issues>`;
      vi.mocked(fs.promises.readFile).mockResolvedValueOnce(lintXml);

      // Call the converter
      await xmlConverter.convertLintToCheckstyle("input.xml", "output.xml");

      // Verify default values are used
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        "output.xml",
        expect.stringContaining('line="0"'),
      );
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        "output.xml",
        expect.stringContaining('column="0"'),
      );
    });

    it("should handle missing optional fields", async () => {
      // Mock reading lint XML with missing optional fields
      const lintXml = `<?xml version="1.0" encoding="utf-8"?><issues><issue><location file="/workspace/repo/app/src/main/java/Test.java" line="1" column="1"/></issue></issues>`;
      vi.mocked(fs.promises.readFile).mockResolvedValueOnce(lintXml);

      // Call the converter
      await xmlConverter.convertLintToCheckstyle("input.xml", "output.xml");

      // Verify default values are used
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        "output.xml",
        expect.stringContaining('severity="info"'),
      );
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        "output.xml",
        expect.stringContaining(": "),
      );
    });

    it("should correctly process the issues.xml test fixture", async () => {
      // Mock reading the test fixture content with the actual content
      vi.mocked(fs.promises.readFile).mockResolvedValueOnce(fixtureContent);

      // Call the converter
      await xmlConverter.convertLintToCheckstyle(
        "tests/fixtures/issues.xml",
        "output.xml",
      );

      // Verify the output contains expected issues
      // Check for MissingPermission issues
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        "output.xml",
        expect.stringContaining(
          "src/main/java/someproject/feature/location/monitoring/data/android/AndroidLocationManager.kt",
        ),
      );
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        "output.xml",
        expect.stringContaining(
          "MissingPermission: Call requires permission which may be rejected by user",
        ),
      );

      // Check for UnknownId issues
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        "output.xml",
        expect.stringContaining(
          "src/main/res/layout/player_order_container_done.xml",
        ),
      );
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        "output.xml",
        expect.stringContaining("UnknownId: The id"),
      );

      // Check for NewApi issues
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        "output.xml",
        expect.stringContaining(
          "src/main/java/someproject/module/core/troubleshooting/impl/data/repository/FullscreenIntentPermissionRepository.kt",
        ),
      );
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        "output.xml",
        expect.stringContaining("NewApi: Call requires API level 34"),
      );

      // Check for DiffUtilEquals issues
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        "output.xml",
        expect.stringContaining(
          "src/main/java/someproject/interclass/common/ui/buttons_dialog/ButtonUiCallback.kt",
        ),
      );
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        "output.xml",
        expect.stringContaining("DiffUtilEquals: Suspicious equality check"),
      );

      // Check for RestrictedApi issues
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        "output.xml",
        expect.stringContaining(
          "src/main/java/someproject/core/ui/chip/SomeDrawable.kt",
        ),
      );
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        "output.xml",
        expect.stringContaining(
          "RestrictedApi: TextDrawableHelper can only be",
        ),
      );

      // Check for UnsafeOptInUsageError issues
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        "output.xml",
        expect.stringContaining(
          "src/main/java/someproject/module/page/ui/toolbar/PageToolbarFragment.kt",
        ),
      );
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        "output.xml",
        expect.stringContaining(
          "UnsafeOptInUsageError: This declaration is opt-in",
        ),
      );

      // Check for CoroutineCreationDuringComposition issues
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        "output.xml",
        expect.stringContaining(
          "src/main/java/someproject/core/compose/component/chip_area/ChipAreaChoice.kt",
        ),
      );
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        "output.xml",
        expect.stringContaining(
          "CoroutineCreationDuringComposition: Calls to launch should happen",
        ),
      );

      // Verify the total number of files processed
      // Count unique file paths in the fixture
      const uniqueFilePaths = new Set([
        "src/main/java/someproject/feature/location/monitoring/data/android/AndroidLocationManager.kt",
        "src/main/java/someproject/feature/location/monitoring/data/gms/FusedLocationManager.kt",
        "src/main/java/someproject/core/map/delegate/GoogleMapDelegate.kt",
        "src/main/java/someproject/core/map/view/GoogleMapView.kt",
        "src/main/java/someproject/core/map/delegate/MapLibreMapDelegate.kt",
        "src/main/java/someproject/legacy/common/utils/TelManager.kt",
        "src/main/res/layout/player_order_container_done.xml",
        "src/main/java/someproject/module/core/troubleshooting/impl/data/repository/FullscreenIntentPermissionRepository.kt",
        "src/main/java/someproject/some/domain/interactor/someFullscreenIntentBannerInteractor.kt",
        "src/main/java/someproject/interclass/common/ui/buttons_dialog/ButtonUiCallback.kt",
        "src/main/java/someproject/interclass/common/ui/dialogs/action_dialog/CellUiCallback.kt",
        "src/main/java/someproject/common/ui/recycler/items/IdentifiableItemUiCallback.kt",
        "src/main/java/someproject/cargo/client/ui/offer/offers/recycler/OffersAdapter.kt",
        "src/main/java/someproject/feature/pdf_screen/ui/adapter/PdfAdapter.kt",
        "src/main/java/someproject/feature/file_storage/feature/pdf/ui/PdfAdapter.kt",
        "src/main/java/someproject/feature/webview/BaseWebViewClient.kt",
        "src/main/java/someproject/core/ui/chip/SomeDrawable.kt",
        "src/main/java/someproject/core/ui/chip/SomeChipGroup.kt",
        "src/main/java/someproject/core/ui/drawable/ShapeDrawable.kt",
        "src/main/java/someproject/core/ui/drawable/TextDrawable.kt",
        "src/main/java/someproject/module/page/ui/toolbar/PageToolbarFragment.kt",
        "src/main/java/someproject/module/page/ui/toolbar/redesign/PageToolbarFragmentRedesign.kt",
        "src/main/java/someproject/core/compose/component/chip_area/ChipAreaChoice.kt",
        "src/main/java/someproject/core/compose/component/rating_choice/RatingChoice.kt",
        "src/main/java/someproject/core/compose/component/cell/preview/CellEndViewPreview.kt",
      ]);

      // Verify that the checkstyle XML contains file elements for each unique file path
      const writeFileCall = vi.mocked(fs.promises.writeFile).mock
        .calls[0][1] as string;
      uniqueFilePaths.forEach(filePath => {
        expect(writeFileCall).toContain(`name="${filePath}"`);
      });

      // Verify the total number of error elements matches the number of issues in the fixture
      // The fixture has 100+ issues, so we'll check for at least 100 error elements
      const errorMatches = writeFileCall.match(/<error /g);
      expect(errorMatches).not.toBeNull();
      expect(errorMatches?.length).toBeGreaterThanOrEqual(100);
    });
  });
});
