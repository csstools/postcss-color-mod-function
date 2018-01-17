// tooling
import Color from './color';
import manageUnresolved from './manage-unresolved';
import names from 'color-name';
import number from 'big.js';
import parser from 'postcss-values-parser';

/* Transform AST
/* ========================================================================== */

export default function transformAST(node, opts) {
	node.nodes.slice(0).forEach(child => {
		if (isColorModFunction(child)) {
			// transform any color-mod() functions
			const color = transformColorModFunction(child, opts);

			if (color) {
				// update the color-mod() function with the transformed value
				child.replaceWith(
					parser.word({
						value: opts.stringifier(color)
					})
				);
			}
		} else if (child.nodes && Object(child.nodes).length) {
			transformAST(child, opts);
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
		// [ <percentage>{3} | <rgb-value>{3} ] [ / <alpha-value> ]?
		[transformRGBValue, transformRGBValue, transformRGBValue, isSlash, transformAlpha],
		// <number>#{3} [ , <alpha-value> ]? ]
		[transformRGBValue, isComma, transformRGBValue, isComma, transformRGBValue, isComma, transformAlpha]
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
		// <hue> <percentage>{2} [ / <alpha-value> ]?
		[transformHue, transformPercentage, transformPercentage, isSlash, transformAlpha],
		// hue, <percentage>#{2} [ , <alpha-value> ]? ]
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
	const [colorOrHueNode, ...adjusterNodes] = (node.nodes || []).slice(1, -1) || [];

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
		const [r, g, b, a, rr, gg, bb, aa] = (node.value.match(hexColorMatch) || []).slice(1);

		const color = new Color({
			red:   rr !== undefined ? Number(number(parseInt(rr, 16)).div(2.55)) : r !== undefined ? Number(number(parseInt(r + r, 16)).div(2.55)) : 0,
			green: gg !== undefined ? Number(number(parseInt(gg, 16)).div(2.55)) : g !== undefined ? Number(number(parseInt(g + g, 16)).div(2.55)) : 0,
			blue:  bb !== undefined ? Number(number(parseInt(bb, 16)).div(2.55)) : b !== undefined ? Number(number(parseInt(b + b, 16)).div(2.55)) : 0,
			alpha: aa !== undefined ? Number(number(parseInt(aa, 16)).div(2.55)) : a !== undefined ? Number(number(parseInt(a + a, 16)).div(2.55)) : 100
		});

		return color;
	} else {
		return manageUnresolved(node, opts, node.value, `Expected a valid hex color`);
	}
}

// return a transformed named-color
function transformNamedColor(node, opts) {
	if (isNamedColor(node)) {
		// <named-color>
		const [red, green, blue] = names[node.value];

		const color = new Color({
			red: Number(number(red).div(2.55)),
			green: Number(number(green).div(2.55)),
			blue: Number(number(blue).div(2.55)),
			alpha: 100,
			colorspace: 'rgb'
		});

		return color;
	} else {
		return manageUnresolved(node, opts, node.value, `Expected a valid named-color`);
	}
}

/* Transform <color-adjuster> functions
/* ========================================================================== */

// return a transformed color using adjustments
function transformColorByAdjusters(color, adjusterNodes, opts) {
	const adjustedColor = adjusterNodes.reduce((base, node) => {
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
			? [
				// [ + | - ] <alpha-value>
				[transformMinusPlusOperator, transformAlpha],
				// * <alpha-value>
				[transformTimesOperator, transformPercentage],
				// <alpha-value>
				[transformAlpha]
			]
		: [
			// [ + | - ] <rgb-value>
			[transformMinusPlusOperator, transformRGBValue],
			// * <percentage>
			[transformTimesOperator, transformPercentage],
			// <rgb-value>
			[transformRGBValue]
		]
	);

	if (operatorOrValue !== undefined) {
		// normalized channel name
		const channel = node.value.toLowerCase().replace(alphaMatch, 'alpha');

		const existingValue = number(base[channel]());

		const modifiedValue = adjustment !== undefined
			? operatorOrValue === '+'
				? existingValue.plus(adjustment)
			: operatorOrValue === '-'
				? existingValue.minus(adjustment)
			: operatorOrValue === '*'
				? existingValue.times(adjustment)
			: adjustment
		: operatorOrValue;

		const modifiedColor = base[channel](Number(modifiedValue));

		return modifiedColor;
	} else {
		return manageUnresolved(node, opts, node.value, `Expected a valid modifier()`);
	}
}

// return a transformed color using an rgb adjustment
function transformRGBAdjuster(base, node, opts) {
	const [arg1, arg2, arg3, arg4] = transformArgsByParams(node, [
			// [ + | - ] <number> <number> <number>
			[transformMinusPlusOperator, transformRGBNumber, transformRGBNumber, transformRGBNumber],
			// [ + | - ] <percentage> <percentage> <percentage>
			[transformMinusPlusOperator, transformPercentage, transformPercentage, transformPercentage],
			// [ + | - ] <hash-token>
			[transformMinusPlusOperator, transformHexColor],
			// [ * ] <percentage>
			[transformTimesOperator, transformPercentage]
		]
	);

	if (arg2 !== undefined && arg2.color) {
		const modifiedColor = base.rgb(
			arg1 === '+'
				? Number(number(base.red()).plus(arg2.red()))
			: Number(number(base.red()).minus(arg2.red())),
			arg1 === '+'
				? Number(number(base.green()).plus(arg2.green()))
			: Number(number(base.green()).minus(arg2.green())),
			arg1 === '+'
				? Number(number(base.blue()).plus(arg2.blue()))
			: Number(number(base.blue()).minus(arg2.blue()))
		);

		return modifiedColor;
	} else if (arg1 !== undefined && minusPlusMatch.test(arg1)) {
		const modifiedColor = base.rgb(
			arg1 === '+'
				? Number(number(base.red()).plus(arg2))
			: Number(number(base.red()).minus(arg2)),
			arg1 === '+'
				? Number(number(base.green()).plus(arg3))
			: Number(number(base.green()).minus(arg3)),
			arg1 === '+'
				? Number(number(base.blue()).plus(arg4))
			: Number(number(base.blue()).minus(arg4))
		);

		return modifiedColor;
	} else if (arg1 !== undefined && arg2 !== undefined) {
		const modifiedColor = base.rgb(
			Number(number(base.red()).times(arg2)),
			Number(number(base.green()).times(arg2)),
			Number(number(base.blue()).times(arg2))
		);

		return modifiedColor;
	} else {
		return manageUnresolved(node, opts, node.value, `Expected a valid rgb() adjuster`);
	}
}

// return a transformed color using a blend/blenda adjustment
function transformBlendAdjuster(base, node, isAlphaBlend, opts) { // eslint-disable-line max-params
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
				? number(existingHue).plus(adjustment)
			: operatorOrHue === '-'
				? number(existingHue).minus(adjustment)
			: operatorOrHue === '*'
				? number(existingHue).times(adjustment)
			: number(adjustment)
		: number(operatorOrHue);

		return base.hue(Number(modifiedValue));
	} else {
		return manageUnresolved(node, opts, node.value, `Expected a valid hue() function)`);
	}
}

// [ b | blackness | l | lightness | s | saturation | w | whiteness ]( [ + | - | * ]? <percentage> )
function transformBlacknessLightnessSaturationWhitenessAdjuster(base, node, opts) {
	const channel = node.value.toLowerCase().replace(/^b$/, 'blackness').replace(/^l$/, 'lightness').replace(/^s$/, 'saturation').replace(/^w$/, 'whiteness');
	const [operatorOrValue, rawAdjustment] = transformArgsByParams(node, [
		[transformMinusPlusTimesOperator, transformPercentage],
		[transformPercentage]
	]);

	if (operatorOrValue !== undefined) {
		const existingValue = number(base[channel]());
		const adjustment = parseFloat(rawAdjustment);

		const rawModifiedValue = !isNaN(adjustment)
			? operatorOrValue === '+'
				? existingValue.plus(adjustment)
			: operatorOrValue === '-'
				? existingValue.minus(adjustment)
			: operatorOrValue === '*'
				? existingValue.times(adjustment)
			: number(adjustment)
		: number(operatorOrValue);

		const modifiedValue = Number(rawModifiedValue);

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
		const modifiedValue = parseFloat(percentage);

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
		return Number(number(node.value).times(100));
	} else if (isPercentage(node)) {
		// <percentage>
		return transformPercentage(node, opts);
	} else {
		return manageUnresolved(node, opts, node.value, `Expected a valid alpha value)`);
	}
}

// return a transformed rgb value
function transformRGBValue(node, opts) {
	if (isNumber(node)) {
		// <rgba-number>
		return transformRGBNumber(node, opts);
	} else if (isPercentage(node)) {
		// <percentage>
		return transformPercentage(node, opts);
	} else {
		return manageUnresolved(node, opts, node.value, `Expected a valid RGB value)`);
	}
}

// return a transformed rgb number
function transformRGBNumber(node, opts) {
	if (isNumber(node)) {
		// <rgba-number>
		return Number(number(node.value).div(2.55));
	} else {
		return manageUnresolved(node, opts, node.value, `Expected a valid RGB value)`);
	}
}

// return a transformed hue
function transformHue(node, opts) {
	if (isHue(node)) {
		// <hue>
		return parseFloat(node.value);
	} else {
		return manageUnresolved(node, opts, node.value, `Expected a valid hue`);
	}
}

// return a transformed percentage
function transformPercentage(node, opts) {
	if (isPercentage(node)) {
		// <percentage>
		return Number(number(node.value));
	} else {
		return manageUnresolved(node, opts, node.value, `Expected a valid hue`);
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

/* Transform helper
/* ========================================================================== */

// return the first set of transformed arguments allowable by the parameters
function transformArgsByParams(node, params) {
	const nodes = (node.nodes || []).slice(1, -1);
	const opts = { unresolved: 'ignore' };

	return params.map(param => nodes.map(
		(childNode, index) => typeof param[index] === 'function' ? param[index](childNode, opts) : undefined
	).filter(child => typeof child !== 'boolean')).filter(param => param.every(
		result => result !== undefined
	))[0] || [];
}

/* Adjustment validators
/* ========================================================================== */

// return whether the node is an a/alpha/blue/green/red adjuster
function isAlphaBlueGreenRedAdjuster(node) {
	// [ a(), alpha(), blue(), green(), red() ]
	return Object(node).type === 'func' && alphaBlueGreenRedMatch.test(node.value);
}

// return whether the node is an rgb adjuster
function isRGBAdjuster(node) {
	return Object(node).type === 'func' && rgbMatch.test(node.value);
}

// return whether the node is a hue adjuster
function isHueAdjuster(node) {
	// [ h() | hue() ]
	return Object(node).type === 'func' && hueMatch.test(node.value);
}

// return whether the node is a blackness/lightness/saturation/whiteness adjuster
function isBlacknessLightnessSaturationWhitenessAdjuster(node) {
	// [ b() | blackness() | l() | lightness() | s() | saturation() | w() | whiteness() ]
	return Object(node).type === 'func' && blacknessLightnessSaturationWhitenessMatch.test(node.value);
}

// return whether the node is a shade/tint adjuster
function isShadeTintAdjuster(node) {
	// [ shade() | tint() ]
	return Object(node).type === 'func' && shadeTintMatch.test(node.value);
}

// return whether the node is a blend adjuster
function isBlendAdjuster(node) {
	// [ blend(), blenda() ]
	return Object(node).type === 'func' && blendMatch.test(node.value);
}

// return whether the node is a contrast adjuster
function isContrastAdjuster(node) {
	// [ contrast() ]
	return Object(node).type === 'func' && contrastMatch.test(node.value);
}

/* Color validators
/* ========================================================================== */

// return whether the node is an rgb/rgba color function
function isRGBFunction(node) {
	// [ rgb(), rgba() ]
	return Object(node).type === 'func' && rgbaMatch.test(node.value);
}

// return whether the node is an hsl color function
function isHSLFunction(node) {
	// [ hsl(), hsla() ]
	return Object(node).type === 'func' && hslaMatch.test(node.value);
}

// return whether the node is an hwb color function
function isHWBFunction(node) {
	// hwb()
	return Object(node).type === 'func' && hwbMatch.test(node.value);
}

// return whether the node is a color-mod function
function isColorModFunction(node) {
	// color-mod()
	return Object(node).type === 'func' && colorModMatch.test(node.value);
}

// return whether the node is a valid named-color
function isNamedColor(node) {
	return Object(node).type === 'word' && node.value in names;
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
	return Object(node).type === 'number' && /^(deg)?$/.test(node.unit);
}

// return whether the comma is valid
function isComma(node) {
	return Object(node).type === 'comma';
}

// return whether the slash operator is valid
function isSlash(node) {
	return Object(node).type === 'operator' && node.value === '/';
}

// return whether the number is valid
function isNumber(node) {
	return Object(node).type === 'number' && node.unit === '';
}

// return whether the mind-plus operator is valid
function isMinusPlusOperator(node) {
	return Object(node).type === 'operator' && minusPlusMatch.test(node.value);
}

// return whether the minus-plus-times operator is valid
function isMinusPlusTimesOperator(node) {
	return Object(node).type === 'operator' && minusPlusTimesMatch.test(node.value);
}

// return whether the times operator is valid
function isTimesOperator(node) {
	return Object(node).type === 'operator' && timesMatch.test(node.value);
}

// return whether the percentage is valid
function isPercentage(node) {
	return Object(node).type === 'number' && (node.unit === '%' || node.value === '0');
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
const hueMatch = /^h(ue)?$/i;
const hwbMatch = /^hwb$/i;
const minusPlusMatch = /^[+-]$/;
const minusPlusTimesMatch = /^[*+-]$/;
const rgbMatch = /^rgb$/i;
const rgbaMatch = /^rgba?$/i;
const shadeTintMatch = /^(shade|tint)$/i;
const timesMatch = /^[*]$/;