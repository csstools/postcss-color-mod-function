// tooling
import { convertDtoD, convertGtoD, convertRtoD, convertTtoD, convertNtoRGB, convertHtoRGB } from './conversions';
import Color from './color';
import manageUnresolved from './manage-unresolved';
import parser from 'postcss-value-parser';

/* Transform AST
/* ========================================================================== */

export default function transformAST(node, opts) {
	node.nodes.slice(0).forEach((child, index) => {
		if (isColorModFunction(child)) {
			// transform any variables within the color-mod() function
			if (opts.transformVars) {
				transformVariables(child, opts);
			}

			// transform any color-mod() functions
			const color = transformColorModFunction(child, opts);

			if (color) {
				// update the color-mod() function with the transformed value
				node.nodes.splice(index, 1, {
					type: 'word',
					value: opts.stringifier(color)
				});
			}
		} else if (child.nodes && Object(child.nodes).length) {
			transformAST(child, opts);
		}
	});
}

/* Transform <var> functions
/* ========================================================================== */

function transformVariables(node, opts) {
	parser.walk(node.nodes, (child, index, nodes) => {
		if (isVariable(child)) {
			// get the custom property and fallback value from var()
			const [prop, fallbackNode] = transformArgsByParams(child, [
				// <value> , [ <fallback> ]?
				[transformWord, isComma, transformNode]
			]);

			// if the custom property is known
			if (prop in opts.customProperties) {
				let customPropertyValue = opts.customProperties[prop];

				// follow custom properties referencing custom properties
				if (looseVarMatch.test(parser.stringify(customPropertyValue))) {
					const rootChildAST = JSON.parse(JSON.stringify({ nodes: customPropertyValue.nodes }));

					transformVariables(rootChildAST, opts);

					customPropertyValue = rootChildAST;
				}

				// replace var() with the custom property value
				if (customPropertyValue.nodes.length) {
					nodes.splice(index, 0, ...JSON.parse(JSON.stringify(customPropertyValue.nodes)));
				}

				nodes.splice(nodes.indexOf(child), 1);
			} else if (fallbackNode && fallbackNode.nodes.length === 1 && fallbackNode.nodes[0].nodes.length) {
				// otherwise, replace var() with the fallback value
				transformVariables(fallbackNode, opts);

				nodes.splice(index, 1, ...fallbackNode.nodes[0].nodes[0]);
			}
		}
	});
}

/* Transform <color> functions
/* ========================================================================== */

function transformColor(node, opts) {
	if (isRGBFunction(node)) {
		return transformRGBFunction(node, opts);
	} else if (isHSLFunction(node)) {
		return transformHSLFunction(node, opts);
	} else if (isHWBFunction(node)) {
		return transformHWBFunction(node, opts);
	} else if (isColorModFunction(node)) {
		return transformColorModFunction(node, opts);
	} else if (isHexColor(node)) {
		return transformHexColor(node, opts);
	} else if (isNamedColor(node)) {
		return transformNamedColor(node, opts);
	} else {
		return manageUnresolved(node, opts, node.value, `Expected a color`);
	}
}

// return a transformed rgb/rgba color function
function transformRGBFunction(node, opts) {
	const [red, green, blue, alpha = 100] = transformArgsByParams(node, [
		// <percentage> <percentage> <percentage> [ , <alpha-value> ]?
		[transformPercentage, transformPercentage, transformPercentage, isSlash, transformAlpha],
		// <number> <number> <number> [ , <alpha-value> ]?
		[transformRGBNumber, transformRGBNumber, transformRGBNumber, isSlash, transformAlpha],
		// <percentage> , <percentage> , <percentage> [ , <alpha-value> ]?
		[transformPercentage, isComma, transformPercentage, isComma, transformPercentage, isComma, transformAlpha],
		// <number> , <number> , <number> [ , <alpha-value> ]?
		[transformRGBNumber, isComma, transformRGBNumber, isComma, transformRGBNumber, isComma, transformAlpha]
	]);

	if (red !== undefined) {
		const color = new Color({ red, green, blue, alpha, colorspace: 'rgb' });

		return color;
	} else {
		return manageUnresolved(node, opts, node.value, `Expected a valid rgb() function`);
	}
}

// return a transformed hsl/hsla color function
function transformHSLFunction(node, opts) {
	const [hue, saturation, lightness, alpha = 100] = transformArgsByParams(node, [
		// <hue> <percentage> <percentage> [ / <alpha-value> ]?
		[transformHue, transformPercentage, transformPercentage, isSlash, transformAlpha],
		// <hue> , <percentage> , <percentage> [ , <alpha-value> ]?
		[transformHue, isComma, transformPercentage, isComma, transformPercentage, isComma, transformAlpha]
	]);

	if (lightness !== undefined) {
		const color = new Color({ hue, saturation, lightness, alpha, colorspace: 'hsl' });

		return color;
	} else {
		return manageUnresolved(node, opts, node.value, `Expected a valid hsl() function`);
	}
}

// return a transformed hwb color function
function transformHWBFunction(node, opts) {
	const [hue, whiteness, blackness, alpha = 100] = transformArgsByParams(node, [
		// <hue> <percentage> <percentage> [ / <alpha-value> ]?
		[transformHue, transformPercentage, transformPercentage, isSlash, transformAlpha]
	]);

	if (blackness !== undefined) {
		const color = new Color({ hue, whiteness, blackness, alpha, colorspace: 'hwb' });

		return color;
	} else {
		return manageUnresolved(node, opts, node.value, `Expected a valid hwb() function`);
	}
}

// return a transformed color-mod color function
function transformColorModFunction(node, opts) {
	// [ <color> | <hue> ] <color-adjuster>*
	const [colorOrHueNode, ...adjusterNodes] = node.nodes || [];

	if (colorOrHueNode !== undefined) {
		const color = isHue(colorOrHueNode)
			? new Color({
				hue: transformHue(colorOrHueNode, opts),
				saturation: 100,
				lightness: 50,
				alpha: 100,
				colorspace: 'hsl'
			})
		: transformColor(colorOrHueNode, opts);

		if (color) {
			const adjustedColor = transformColorByAdjusters(color, adjusterNodes, opts);

			return adjustedColor;
		} else {
			return manageUnresolved(node, opts, node.value, `Expected a valid color`);
		}
	} else {
		return manageUnresolved(node, opts, node.value, `Expected a valid color-mod() function`);
	}
}

// return a transformed hex color
function transformHexColor(node, opts) {
	if (hexColorMatch.test(node.value)) {
		// #<hex-color>{3,4,6,8}
		const [red, green, blue, alpha] = convertHtoRGB(node.value);

		const color = new Color({ red, green, blue, alpha });

		return color;
	} else {
		return manageUnresolved(node, opts, node.value, `Expected a valid hex color`);
	}
}

// return a transformed named-color
function transformNamedColor(node, opts) {
	if (isNamedColor(node)) {
		// <named-color>
		const [red, green, blue] = convertNtoRGB(node.value);

		const color = new Color({ red, green, blue, alpha: 100, colorspace: 'rgb' });

		return color;
	} else {
		return manageUnresolved(node, opts, node.value, `Expected a valid named-color`);
	}
}

/* Transform <color-adjuster> functions
/* ========================================================================== */

// return a transformed color using adjustments
function transformColorByAdjusters(color, adjusterNodes, opts) {
	const adjustedColor = adjusterNodes.filter((node) => {
		return node.type !== 'space' && node.type !== 'comment';
	}).reduce((base, node) => {
		if (isAlphaBlueGreenRedAdjuster(node)) {
			return transformAlphaBlueGreenRedAdjuster(base, node, opts);
		} else if (isRGBAdjuster(node)) {
			return transformRGBAdjuster(base, node, opts);
		} else if (isHueAdjuster(node)) {
			return transformHueAdjuster(base, node, opts);
		} else if (isBlacknessLightnessSaturationWhitenessAdjuster(node)) {
			return transformBlacknessLightnessSaturationWhitenessAdjuster(base, node, opts);
		} else if (isShadeTintAdjuster(node)) {
			return transformShadeTintAdjuster(base, node, opts);
		} else if (isBlendAdjuster(node)) {
			return transformBlendAdjuster(base, node, node.value === 'blenda', opts);
		} else if (isContrastAdjuster(node)) {
			return transformContrastAdjuster(base, node, opts);
		} else {
			manageUnresolved(node, opts, node.value, `Expected a valid color adjuster`);

			return base;
		}
	}, color);

	return adjustedColor;
}

// return a transformed color using a/alpha/blue/green/red adjustments
function transformAlphaBlueGreenRedAdjuster(base, node, opts) {
	const [operatorOrValue, adjustment] = transformArgsByParams(node, alphaMatch.test(node.value)
			// a/alpha adjustments
			? [
				// [ + | - ] <alpha-value>
				[transformMinusPlusOperator, transformAlpha],
				// * <percentage>
				[transformTimesOperator, transformPercentage],
				// <alpha-value>
				[transformAlpha]
			]
		// blue/green/red adjustments
		: [
			// [ + | - ] <percentage>
			[transformMinusPlusOperator, transformPercentage],
			// [ + | - ] <number>
			[transformMinusPlusOperator, transformRGBNumber],
			// * <percentage>
			[transformTimesOperator, transformPercentage],
			// <percentage>
			[transformPercentage],
			// <number>
			[transformRGBNumber]
		]
	);

	if (operatorOrValue !== undefined) {
		// normalized channel name
		const channel = node.value.toLowerCase().replace(alphaMatch, 'alpha');

		const existingValue = base[channel]();

		const modifiedValue = adjustment !== undefined
			? operatorOrValue === '+'
				? existingValue + Number(adjustment)
			: operatorOrValue === '-'
				? existingValue - Number(adjustment)
			: operatorOrValue === '*'
				? existingValue * Number(adjustment)
			: Number(adjustment)
		: Number(operatorOrValue);

		const modifiedColor = base[channel](modifiedValue);

		return modifiedColor;
	} else {
		return manageUnresolved(node, opts, node.value, `Expected a valid modifier()`);
	}
}

// return a transformed color using an rgb adjustment
function transformRGBAdjuster(base, node, opts) {
	const [arg1, arg2, arg3, arg4] = transformArgsByParams(node, [
			// [ + | - ] <percentage> <percentage> <percentage>
			[transformMinusPlusOperator, transformPercentage, transformPercentage, transformPercentage],
			// [ + | - ] <number> <number> <number>
			[transformMinusPlusOperator, transformRGBNumber, transformRGBNumber, transformRGBNumber],
			// [ + | - ] <hash-token>
			[transformMinusPlusOperator, transformHexColor],
			// [ * ] <percentage>
			[transformTimesOperator, transformPercentage]
		]
	);

	if (arg2 !== undefined && arg2.color) {
		const modifiedColor = base.rgb(
			arg1 === '+'
				? base.red() + arg2.red()
			: base.red() - arg2.red(),
			arg1 === '+'
				? base.green() + arg2.green()
			: base.green() - arg2.green(),
			arg1 === '+'
				? base.blue() + arg2.blue()
			: base.blue() - arg2.blue()
		);

		return modifiedColor;
	} else if (arg1 !== undefined && minusPlusMatch.test(arg1)) {
		const modifiedColor = base.rgb(
			arg1 === '+'
				? base.red() + arg2
			: base.red() - arg2,
			arg1 === '+'
				? base.green() + arg3
			: base.green() - arg3,
			arg1 === '+'
				? base.blue() + arg4
			: base.blue() - arg4
		);

		return modifiedColor;
	} else if (arg1 !== undefined && arg2 !== undefined) {
		const modifiedColor = base.rgb(
			base.red() * arg2,
			base.green() * arg2,
			base.blue() * arg2
		);

		return modifiedColor;
	} else {
		return manageUnresolved(node, opts, node.value, `Expected a valid rgb() adjuster`);
	}
}

// return a transformed color using a blend/blenda adjustment
function transformBlendAdjuster(base, node, isAlphaBlend, opts) {
	const [color, percentage, colorspace = 'rgb'] = transformArgsByParams(node, [
		[transformColor, transformPercentage, transformColorSpace]
	]);

	if (percentage !== undefined) {
		const modifiedColor = isAlphaBlend
			? base.blenda(color.color, percentage, colorspace)
		: base.blend(color.color, percentage, colorspace);

		return modifiedColor;
	} else {
		return manageUnresolved(node, opts, node.value, `Expected a valid blend() adjuster)`);
	}
}

// return a transformed color using a contrast adjustment
function transformContrastAdjuster(base, node, opts) {
	const [percentage] = transformArgsByParams(node, [
		// <percentage>
		[transformPercentage]
	]);

	if (percentage !== undefined) {
		const modifiedColor = base.contrast(percentage);

		return modifiedColor;
	} else {
		return manageUnresolved(node, opts, node.value, `Expected a valid contrast() adjuster)`);
	}
}

// return a transformed color using a hue adjustment
function transformHueAdjuster(base, node, opts) {
	const [operatorOrHue, adjustment] = transformArgsByParams(node, [
		// [ + | - | * ] <angle>
		[transformMinusPlusTimesOperator, transformHue],
		// <angle>
		[transformHue]
	]);

	if (operatorOrHue !== undefined) {
		const existingHue = base.hue();

		const modifiedValue = adjustment !== undefined
			? operatorOrHue === '+'
				? existingHue + Number(adjustment)
			: operatorOrHue === '-'
				? existingHue - Number(adjustment)
			: operatorOrHue === '*'
				? existingHue * Number(adjustment)
			: Number(adjustment)
		: Number(operatorOrHue);

		return base.hue(modifiedValue);
	} else {
		return manageUnresolved(node, opts, node.value, `Expected a valid hue() function)`);
	}
}

// [ b | blackness | l | lightness | s | saturation | w | whiteness ]( [ + | - | * ]? <percentage> )
function transformBlacknessLightnessSaturationWhitenessAdjuster(base, node, opts) {
	const channel = node.value.toLowerCase().replace(/^b$/, 'blackness').replace(/^l$/, 'lightness').replace(/^s$/, 'saturation').replace(/^w$/, 'whiteness');
	const [operatorOrValue, adjustment] = transformArgsByParams(node, [
		[transformMinusPlusTimesOperator, transformPercentage],
		[transformPercentage]
	]);

	if (operatorOrValue !== undefined) {
		const existingValue = base[channel]();

		const modifiedValue = adjustment !== undefined
			? operatorOrValue === '+'
				? existingValue + Number(adjustment)
			: operatorOrValue === '-'
				? existingValue - Number(adjustment)
			: operatorOrValue === '*'
				? existingValue * Number(adjustment)
			: Number(adjustment)
		: Number(operatorOrValue);

		return base[channel](modifiedValue);
	} else {
		return manageUnresolved(node, opts, node.value, `Expected a valid ${channel}() function)`);
	}
}

// return a transformed color using shade/tint adjustments
function transformShadeTintAdjuster(base, node, opts) {
	const channel = node.value.toLowerCase();
	const [percentage] = transformArgsByParams(node, [
		// [ shade | tint ]( <percentage> )
		[transformPercentage]
	]);

	if (percentage !== undefined) {
		const modifiedValue = Number(percentage);

		return base[channel](modifiedValue);
	} else {
		return manageUnresolved(node, opts, node.value, `Expected valid ${channel}() arguments`);
	}
}

/* Argument Transforms
/* ========================================================================== */

// return a transformed color space
function transformColorSpace(node, opts) {
	if (isColorSpace(node)) {
		// [ hsl | hwb | rgb ]
		return node.value;
	} else {
		return manageUnresolved(node, opts, node.value, `Expected a valid color space)`);
	}
}

// return a transformed alpha value
function transformAlpha(node, opts) {
	if (isNumber(node)) {
		// <number>
		return Number(parser.unit(node.value).number) * 100;
	} else if (isPercentage(node)) {
		// <percentage>
		return transformPercentage(node, opts);
	} else {
		return manageUnresolved(node, opts, node.value, `Expected a valid alpha value)`);
	}
}

// return a transformed rgb number
function transformRGBNumber(node, opts) {
	if (isNumber(node)) {
		// <number>
		return node.value / 2.55;
	} else {
		return manageUnresolved(node, opts, node.value, `Expected a valid RGB value)`);
	}
}

// return a transformed hue
function transformHue(node, opts) {
	if (isHue(node)) {
		// <hue> = <number> | <angle>
		const unit = parser.unit(node.value).unit.toLowerCase();

		if (unit === 'grad') {
			// if <angle> = <gradian> (400 per circle)
			return convertGtoD(Number(parser.unit(node.value).number));
		} else if (unit === 'rad') {
			// if <angle> = <radian> (2π per circle)
			return convertRtoD(Number(parser.unit(node.value).number));
		} else if (unit === 'turn') {
			// if <angle> = <turn> (1 per circle)
			return convertTtoD(Number(parser.unit(node.value).number));
		} else {
			// if <angle> = [ <degree> | <number> ] (360 per circle)
			return convertDtoD(Number(parser.unit(node.value).number));
		}
	} else {
		return manageUnresolved(node, opts, node.value, `Expected a valid hue`);
	}
}

// return a transformed percentage
function transformPercentage(node, opts) {
	if (isPercentage(node)) {
		// <percentage>
		return Number(parser.unit(node.value).number);
	} else {
		return manageUnresolved(node, opts, node.value, `Expected a valid percentage`);
	}
}

// return a transformed minus-plus operator
function transformMinusPlusOperator(node, opts) {
	if (isMinusPlusOperator(node)) {
		// [ - | + ]
		return node.value;
	} else {
		return manageUnresolved(node, opts, node.value, `Expected a plus or minus operator`);
	}
}

// return a transformed times operator
function transformTimesOperator(node, opts) {
	if (isTimesOperator(node)) {
		// [ * ]
		return node.value;
	} else {
		return manageUnresolved(node, opts, node.value, `Expected a times operator`);
	}
}

// return a transformed minus-plus-times operator
function transformMinusPlusTimesOperator(node, opts) {
	if (isMinusPlusTimesOperator(node)) {
		// [ - | + | * ]
		return node.value;
	} else {
		return manageUnresolved(node, opts, node.value, `Expected a plus, minus, or times operator`);
	}
}

/* Additional transforms
/* ========================================================================== */

function transformWord(node, opts) {
	if (isWord(node)) {
		return node.value;
	} else {
		return manageUnresolved(node, opts, node.value, `Expected a valid word`);
	}
}

function transformNode(node) {
	return Object(node);
}

/* Transform helper
/* ========================================================================== */

// return the first set of transformed arguments allowable by the parameters
function transformArgsByParams(node, params) {
	const nodes = (node.nodes || []).filter((node) => {
		return node.type !== 'space' && node.type !== 'comment';
	});
	const opts = { unresolved: 'ignore' };

	return params.map((param) => {
		return nodes.map((childNode, index) => {
			return typeof param[index] === 'function' ? param[index](childNode, opts) : undefined
		}).filter((child) => {
			return typeof child !== 'boolean'
		})
	}).filter((param) => {
		return param.every((result) => {
			return result !== undefined
		})
	})[0] || [];
}

/* Variable validators
/* ========================================================================== */

// return whether the node is a var function
function isVariable(node) {
	// var()
	return Object(node).type === 'function' && varMatch.test(node.value);
}

/* Adjustment validators
/* ========================================================================== */

// return whether the node is an a/alpha/blue/green/red adjuster
function isAlphaBlueGreenRedAdjuster(node) {
	// [ a(), alpha(), blue(), green(), red() ]
	return Object(node).type === 'function' && alphaBlueGreenRedMatch.test(node.value);
}

// return whether the node is an rgb adjuster
function isRGBAdjuster(node) {
	return Object(node).type === 'function' && rgbMatch.test(node.value);
}

// return whether the node is a hue adjuster
function isHueAdjuster(node) {
	// [ h() | hue() ]
	return Object(node).type === 'function' && hueMatch.test(node.value);
}

// return whether the node is a blackness/lightness/saturation/whiteness adjuster
function isBlacknessLightnessSaturationWhitenessAdjuster(node) {
	// [ b() | blackness() | l() | lightness() | s() | saturation() | w() | whiteness() ]
	return Object(node).type === 'function' && blacknessLightnessSaturationWhitenessMatch.test(node.value);
}

// return whether the node is a shade/tint adjuster
function isShadeTintAdjuster(node) {
	// [ shade() | tint() ]
	return Object(node).type === 'function' && shadeTintMatch.test(node.value);
}

// return whether the node is a blend adjuster
function isBlendAdjuster(node) {
	// [ blend(), blenda() ]
	return Object(node).type === 'function' && blendMatch.test(node.value);
}

// return whether the node is a contrast adjuster
function isContrastAdjuster(node) {
	// [ contrast() ]
	return Object(node).type === 'function' && contrastMatch.test(node.value);
}

/* Color validators
/* ========================================================================== */

// return whether the node is an rgb/rgba color function
function isRGBFunction(node) {
	// [ rgb(), rgba() ]
	return Object(node).type === 'function' && rgbaMatch.test(node.value);
}

// return whether the node is an hsl color function
function isHSLFunction(node) {
	// [ hsl(), hsla() ]
	return Object(node).type === 'function' && hslaMatch.test(node.value);
}

// return whether the node is an hwb color function
function isHWBFunction(node) {
	// hwb()
	return Object(node).type === 'function' && hwbMatch.test(node.value);
}

// return whether the node is a color-mod function
function isColorModFunction(node) {
	// color-mod()
	return Object(node).type === 'function' && colorModMatch.test(node.value);
}

// return whether the node is a valid named-color
function isNamedColor(node) {
	return Object(node).type === 'word' && Boolean(convertNtoRGB(node.value));
}

// return whether the node is a valid hex color
function isHexColor(node) {
	// #<hex-color>{3,4,6,8}
	return Object(node).type === 'word' && hexColorMatch.test(node.value);
}

// return whether the node is a valid color space
function isColorSpace(node) {
	// [ hsl | hwb | rgb ]
	return Object(node).type === 'word' && colorSpaceMatch.test(node.value);
}

/* Additional validators
/* ========================================================================== */

// return whether the hue value is valid
function isHue(node) {
	if (Object(node).type !== 'word') {
		return false;
	}

	const parsedNumber = parser.unit(node.value);
	return parsedNumber && hueUnitMatch.test(parsedNumber.unit);
}

// return whether the comma is valid
function isComma(node) {
	return Object(node).type === 'div' && node.value === ',';
}

// return whether the slash operator is valid
function isSlash(node) {
	return Object(node).type === 'div' && node.value === '/';
}

// return whether the number is valid
function isNumber(node) {
	if (Object(node).type !== 'word') {
		return false;
	}

	const parsedNumber = parser.unit(node.value);
	return parsedNumber && parsedNumber.unit === '';
}

// return whether the mind-plus operator is valid
function isMinusPlusOperator(node) {
	return Object(node).type === 'word' && minusPlusMatch.test(node.value);
}

// return whether the minus-plus-times operator is valid
function isMinusPlusTimesOperator(node) {
	return Object(node).type === 'word' && minusPlusTimesMatch.test(node.value);
}

// return whether the times operator is valid
function isTimesOperator(node) {
	return Object(node).type === 'word' && timesMatch.test(node.value);
}

// return whether the percentage is valid
function isPercentage(node) {
	if (Object(node).type !== 'word') {
		return false;
	}

	const parsedNumber = parser.unit(node.value);
	return parsedNumber && (parsedNumber.unit === '%' || parseFloat(parsedNumber.number) === 0);
}

// return whether the node is a word
function isWord(node) {
	// <word>
	return Object(node).type === 'word';
}

/* Matchers
/* ========================================================================== */

const alphaMatch = /^a(lpha)?$/i;
const alphaBlueGreenRedMatch = /^(a(lpha)?|blue|green|red)$/i;
const blacknessLightnessSaturationWhitenessMatch = /^(b(lackness)?|l(ightness)?|s(aturation)?|w(hiteness)?)$/i;
const blendMatch = /^blenda?$/i;
const colorModMatch = /^color-mod$/i;
const colorSpaceMatch = /^(hsl|hwb|rgb)$/i;
const contrastMatch = /^contrast$/i;
const hexColorMatch = /^#(?:([a-f0-9])([a-f0-9])([a-f0-9])([a-f0-9])?|([a-f0-9]{2})([a-f0-9]{2})([a-f0-9]{2})([a-f0-9]{2})?)$/i;
const hslaMatch = /^hsla?$/i;
const hueUnitMatch = /^(deg|grad|rad|turn)?$/i;
const hueMatch = /^h(ue)?$/i;
const hwbMatch = /^hwb$/i;
const minusPlusMatch = /^[+-]$/;
const minusPlusTimesMatch = /^[*+-]$/;
const rgbMatch = /^rgb$/i;
const rgbaMatch = /^rgba?$/i;
const shadeTintMatch = /^(shade|tint)$/i;
const varMatch = /^var$/i;
const looseVarMatch = /(^|[^\w-])var\(/i;
const timesMatch = /^[*]$/;
