import { Document, Paragraph, HeadingLevel, ImageRun } from 'docx';
import { DEFAULT_STEP_CAPTION } from '../shared/constants.js';

const IMAGE_DISPLAY_WIDTH = 600;

// One docx Section per part - Document's sections array starts each entry on
// a new page automatically, so part boundaries need no manual PageBreak nodes.
// The document title gets its own leading section (its own page) for the same reason.
export async function buildDocx({ title, parts, stepsByPart }) {
  const titleSection = {
    properties: {},
    children: [new Paragraph({ text: title, heading: HeadingLevel.TITLE })],
  };

  const partSections = await Promise.all(
    parts.map(async (part, index) => {
      const steps = stepsByPart.get(part.id) ?? [];
      const stepChildren = (await Promise.all(steps.map(buildStepParagraphs))).flat();
      const children = [];
      children.push(new Paragraph({ text: part.title, heading: HeadingLevel.HEADING_1 }));
      children.push(...stepChildren);
      return { properties: {}, children };
    })
  );

  return new Document({ title, sections: [titleSection, ...partSections] });
}

async function buildStepParagraphs(step) {
  const imageData = await dataUrlToUint8Array(step.imageDataUrl);
  const displayWidth = IMAGE_DISPLAY_WIDTH;
  const displayHeight = Math.round((displayWidth * step.height) / step.width);

  // Leave the caption paragraph blank (rather than the literal placeholder
  // text) so the user has a clean spot to type a caption directly in Word.
  const captionText = step.caption === DEFAULT_STEP_CAPTION ? '' : step.caption;

  return [
    new Paragraph({ text: `Step ${step.order}`, heading: HeadingLevel.HEADING_2 }),
    new Paragraph({
      children: [
        new ImageRun({
          data: imageData,
          type: 'jpg',
          transformation: { width: displayWidth, height: displayHeight },
        }),
      ],
    }),
    new Paragraph({ text: captionText }),
  ];
}

async function dataUrlToUint8Array(dataUrl) {
  const res = await fetch(dataUrl);
  const buffer = await res.arrayBuffer();
  return new Uint8Array(buffer);
}
