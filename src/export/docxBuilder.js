import { Document, Paragraph, HeadingLevel, ImageRun } from 'docx';

const IMAGE_DISPLAY_WIDTH = 600;

// One docx Section per part - Document's sections array starts each entry on
// a new page automatically, so part boundaries need no manual PageBreak nodes.
export async function buildDocx({ parts, stepsByPart }) {
  const sections = await Promise.all(
    parts.map(async (part, index) => {
      const steps = stepsByPart.get(part.id) ?? [];
      const stepChildren = (await Promise.all(steps.map(buildStepParagraphs))).flat();
      const children = [];
      children.push(new Paragraph({ text: part.title, heading: HeadingLevel.HEADING_1 }));
      children.push(...stepChildren);
      return { properties: {}, children };
    })
  );

  return new Document({ sections });
}

async function buildStepParagraphs(step) {
  const imageData = await dataUrlToUint8Array(step.imageDataUrl);
  const displayWidth = IMAGE_DISPLAY_WIDTH;
  const displayHeight = Math.round((displayWidth * step.height) / step.width);

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
    new Paragraph({ text: step.caption }),
  ];
}

async function dataUrlToUint8Array(dataUrl) {
  const res = await fetch(dataUrl);
  const buffer = await res.arrayBuffer();
  return new Uint8Array(buffer);
}
