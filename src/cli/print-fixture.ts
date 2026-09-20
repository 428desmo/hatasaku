import { samplePublicView } from "../view/fixture.js";
import { toPresentation } from "../view/presentation.js";
import { renderText } from "../view/text.js";

console.log(renderText(toPresentation(samplePublicView, 0)));
