'use strict';

var parser = require('postcss-value-parser');
var fs = require('fs');
var path = require('path');
var postcss = require('postcss');
var convertColors = require('@csstools/convert-colors');

// return custom selectors from the css root, conditionally removing them
function getCustomProperties(root, opts) {
	// initialize custom selectors
	const customPropertiesFromHtmlElement = {};
	const customPropertiesFromRootPsuedo = {};

	// for each html or :root rule
	root.nodes.slice().forEach(rule => {
		const customPropertiesObject = isHtmlRule(rule)
			? customPropertiesFromHtmlElement
		: isRootRule(rule)
			? customPropertiesFromRootPsuedo
		: null;

		// for each custom property
		if (customPropertiesObject) {
			rule.nodes.slice().forEach(decl => {
				if (isCustomDecl(decl)) {
					const { prop } = decl;

					// write the parsed value to the custom property
					customPropertiesObject[prop] = parser(decl.value);

					// conditionally remove the custom property declaration
					if (!opts.preserve) {
						decl.remove();
					}
				}
			});

			// conditionally remove the empty html or :root rule
			if (!opts.preserve && isEmptyParent(rule)) {
				rule.remove();
			}
		}
	});

	// return all custom properties, preferring :root properties over html properties
	return { ...customPropertiesFromHtmlElement, ...customPropertiesFromRootPsuedo };
}

// match html and :root rules
const htmlSelectorRegExp = /^html$/i;
const rootSelectorRegExp = /^:root$/i;
const customPropertyRegExp = /^--[A-z][\w-]*$/;

// whether the node is an html or :root rule
const isHtmlRule = node => node.type === 'rule' && htmlSelectorRegExp.test(node.selector) && Object(node.nodes).length;
const isRootRule = node => node.type === 'rule' && rootSelectorRegExp.test(node.selector) && Object(node.nodes).length;

// whether the node is an custom property
const isCustomDecl = node => node.type === 'decl' && customPropertyRegExp.test(node.prop);

// whether the node is a parent without children
const isEmptyParent = node => Object(node.nodes).length === 0;

/* Import Custom Properties from CSS AST
/* ========================================================================== */

function importCustomPropertiesFromCSSAST(root) {
	return getCustomProperties(root, { preserve: true });
}

/* Import Custom Properties from CSS File
/* ========================================================================== */

async function importCustomPropertiesFromCSSFile(from) {
	const css = await readFile(from);
	const root = postcss.parse(css, { from });

	return importCustomPropertiesFromCSSAST(root);
}

/* Import Custom Properties from Object
/* ========================================================================== */

function importCustomPropertiesFromObject(object) {
	const customProperties = Object.assign(
		{},
		Object(object).customProperties || Object(object)['custom-properties']
	);

	for (const prop in customProperties) {
		customProperties[prop] = parser(customProperties[prop]);
	}

	return customProperties;
}

/* Import Custom Properties from JSON file
/* ========================================================================== */

async function importCustomPropertiesFromJSONFile(from) {
	const object = await readJSON(from);

	return importCustomPropertiesFromObject(object);
}

/* Import Custom Properties from JS file
/* ========================================================================== */

async function importCustomPropertiesFromJSFile(from) {
	const object = await import(from);

	return importCustomPropertiesFromObject(('default' in object) ? object.default : object);
}

/* Import Custom Properties from Sources
/* ========================================================================== */

function importCustomPropertiesFromSources(sources) {
	return sources.map(source => {
		if (source instanceof Promise) {
			return source;
		} else if (source instanceof Function) {
			return source();
		}

		// read the source as an object
		const opts = source === Object(source) ? source : { from: String(source) };

		// skip objects with Custom Properties
		if (opts.customProperties || opts['custom-properties']) {
			return opts
		}

		// source pathname
		const from = path.resolve(String(opts.from || ''));

		// type of file being read from
		const type = (opts.type || path.extname(from).slice(1)).toLowerCase();

		return { type, from };
	}).reduce(async (customProperties, source) => {
		const { type, from } = await source;

		if (type === 'ast') {
			return Object.assign(await customProperties, importCustomPropertiesFromCSSAST(from));
		}

		if (type === 'css') {
			return Object.assign(await customProperties, await importCustomPropertiesFromCSSFile(from));
		}

		if (type === 'js') {
			return Object.assign(await customProperties, await importCustomPropertiesFromJSFile(from));
		}

		if (type === 'json') {
			return Object.assign(await customProperties, await importCustomPropertiesFromJSONFile(from));
		}

		return Object.assign(await customProperties, await importCustomPropertiesFromObject(await source));
	}, {});
}

/* Helper utilities
/* ========================================================================== */

const readFile = from => new Promise((resolve, reject) => {
	fs.readFile(from, 'utf8', (error, result) => {
		if (error) {
			reject(error);
		} else {
			resolve(result);
		}
	});
});

const readJSON = async from => JSON.parse(await readFile(from));

/* Convert Degree to Hue Degree
/* ========================================================================== */

function convertDtoD(deg) {
	return deg % 360;
}

/* Convert Gradian to Hue Degree
/* ========================================================================== */

function convertGtoD(grad) {
	return grad * 0.9 % 360;
}

/* Convert Radian to Hue Degree
/* ========================================================================== */

function convertRtoD(rad) {
	return rad * 180 / Math.PI % 360;
}

/* Convert Turn to Hue Degree
/* ========================================================================== */

function convertTtoD(turn) {
	return turn * 360 % 360;
}

/* Convert a Name to Red/Green/Blue
/* ========================================================================== */

function convertNtoRGB(name) {
	const names = {
		aliceblue: [240, 248, 255],
		antiquewhite: [250, 235, 215],
		aqua: [0, 255, 255],
		aquamarine: [127, 255, 212],
		azure: [240, 255, 255],
		beige: [245, 245, 220],
		bisque: [255, 228, 196],
		black: [0, 0, 0],
		blanchedalmond: [255, 235, 205],
		blue: [0, 0, 255],
		blueviolet: [138, 43, 226],
		brown: [165, 42, 42],
		burlywood: [222, 184, 135],
		cadetblue: [95, 158, 160],
		chartreuse: [127, 255, 0],
		chocolate: [210, 105, 30],
		coral: [255, 127, 80],
		cornflowerblue: [100, 149, 237],
		cornsilk: [255, 248, 220],
		crimson: [220, 20, 60],
		cyan: [0, 255, 255],
		darkblue: [0, 0, 139],
		darkcyan: [0, 139, 139],
		darkgoldenrod: [184, 134, 11],
		darkgray: [169, 169, 169],
		darkgreen: [0, 100, 0],
		darkgrey: [169, 169, 169],
		darkkhaki: [189, 183, 107],
		darkmagenta: [139, 0, 139],
		darkolivegreen: [85, 107, 47],
		darkorange: [255, 140, 0],
		darkorchid: [153, 50, 204],
		darkred: [139, 0, 0],
		darksalmon: [233, 150, 122],
		darkseagreen: [143, 188, 143],
		darkslateblue: [72, 61, 139],
		darkslategray: [47, 79, 79],
		darkslategrey: [47, 79, 79],
		darkturquoise: [0, 206, 209],
		darkviolet: [148, 0, 211],
		deeppink: [255, 20, 147],
		deepskyblue: [0, 191, 255],
		dimgray: [105, 105, 105],
		dimgrey: [105, 105, 105],
		dodgerblue: [30, 144, 255],
		firebrick: [178, 34, 34],
		floralwhite: [255, 250, 240],
		forestgreen: [34, 139, 34],
		fuchsia: [255, 0, 255],
		gainsboro: [220, 220, 220],
		ghostwhite: [248, 248, 255],
		gold: [255, 215, 0],
		goldenrod: [218, 165, 32],
		gray: [128, 128, 128],
		green: [0, 128, 0],
		greenyellow: [173, 255, 47],
		grey: [128, 128, 128],
		honeydew: [240, 255, 240],
		hotpink: [255, 105, 180],
		indianred: [205, 92, 92],
		indigo: [75, 0, 130],
		ivory: [255, 255, 240],
		khaki: [240, 230, 140],
		lavender: [230, 230, 250],
		lavenderblush: [255, 240, 245],
		lawngreen: [124, 252, 0],
		lemonchiffon: [255, 250, 205],
		lightblue: [173, 216, 230],
		lightcoral: [240, 128, 128],
		lightcyan: [224, 255, 255],
		lightgoldenrodyellow: [250, 250, 210],
		lightgray: [211, 211, 211],
		lightgreen: [144, 238, 144],
		lightgrey: [211, 211, 211],
		lightpink: [255, 182, 193],
		lightsalmon: [255, 160, 122],
		lightseagreen: [32, 178, 170],
		lightskyblue: [135, 206, 250],
		lightslategray: [119, 136, 153],
		lightslategrey: [119, 136, 153],
		lightsteelblue: [176, 196, 222],
		lightyellow: [255, 255, 224],
		lime: [0, 255, 0],
		limegreen: [50, 205, 50],
		linen: [250, 240, 230],
		magenta: [255, 0, 255],
		maroon: [128, 0, 0],
		mediumaquamarine: [102, 205, 170],
		mediumblue: [0, 0, 205],
		mediumorchid: [186, 85, 211],
		mediumpurple: [147, 112, 219],
		mediumseagreen: [60, 179, 113],
		mediumslateblue: [123, 104, 238],
		mediumspringgreen: [0, 250, 154],
		mediumturquoise: [72, 209, 204],
		mediumvioletred: [199, 21, 133],
		midnightblue: [25, 25, 112],
		mintcream: [245, 255, 250],
		mistyrose: [255, 228, 225],
		moccasin: [255, 228, 181],
		navajowhite: [255, 222, 173],
		navy: [0, 0, 128],
		oldlace: [253, 245, 230],
		olive: [128, 128, 0],
		olivedrab: [107, 142, 35],
		orange: [255, 165, 0],
		orangered: [255, 69, 0],
		orchid: [218, 112, 214],
		palegoldenrod: [238, 232, 170],
		palegreen: [152, 251, 152],
		paleturquoise: [175, 238, 238],
		palevioletred: [219, 112, 147],
		papayawhip: [255, 239, 213],
		peachpuff: [255, 218, 185],
		peru: [205, 133, 63],
		pink: [255, 192, 203],
		plum: [221, 160, 221],
		powderblue: [176, 224, 230],
		purple: [128, 0, 128],
		rebeccapurple: [102, 51, 153],
		red: [255, 0, 0],
		rosybrown: [188, 143, 143],
		royalblue: [65, 105, 225],
		saddlebrown: [139, 69, 19],
		salmon: [250, 128, 114],
		sandybrown: [244, 164, 96],
		seagreen: [46, 139, 87],
		seashell: [255, 245, 238],
		sienna: [160, 82, 45],
		silver: [192, 192, 192],
		skyblue: [135, 206, 235],
		slateblue: [106, 90, 205],
		slategray: [112, 128, 144],
		slategrey: [112, 128, 144],
		snow: [255, 250, 250],
		springgreen: [0, 255, 127],
		steelblue: [70, 130, 180],
		tan: [210, 180, 140],
		teal: [0, 128, 128],
		thistle: [216, 191, 216],
		tomato: [255, 99, 71],
		transparent: [0, 0, 0],
		turquoise: [64, 224, 208],
		violet: [238, 130, 238],
		wheat: [245, 222, 179],
		white: [255, 255, 255],
		whitesmoke: [245, 245, 245],
		yellow: [255, 255, 0],
		yellowgreen: [154, 205, 50]
	};

	return names[name] && names[name].map(c => c / 2.55);
}


/* Convert a Hex to Red/Green/Blue
/* ========================================================================== */

function convertHtoRGB(hex) {
	// #<hex-color>{3,4,6,8}
	const [r, g, b, a, rr, gg, bb, aa] = (hex.match(hexColorMatch$1) || []).slice(1);

	if (rr !== undefined || r !== undefined) {
		const red   = rr !== undefined ? parseInt(rr, 16) : r !== undefined ? parseInt(r + r, 16) : 0;
		const green = gg !== undefined ? parseInt(gg, 16) : g !== undefined ? parseInt(g + g, 16) : 0;
		const blue  = bb !== undefined ? parseInt(bb, 16) : b !== undefined ? parseInt(b + b, 16) : 0;
		const alpha = aa !== undefined ? parseInt(aa, 16) : a !== undefined ? parseInt(a + a, 16) : 255;

		return [red, green, blue, alpha].map(c => c / 2.55);
	}

	return undefined;
}

const hexColorMatch$1 = /^#(?:([a-f0-9])([a-f0-9])([a-f0-9])([a-f0-9])?|([a-f0-9]{2})([a-f0-9]{2})([a-f0-9]{2})([a-f0-9]{2})?)$/i;

class Color {
	constructor(color) {
		this.color = Object(Object(color).color || color);

		this.color.colorspace = this.color.colorspace
			? this.color.colorspace
		: 'red' in color && 'green' in color && 'blue' in color
			? 'rgb'
		: 'hue' in color && 'saturation' in color && 'lightness' in color
			? 'hsl'
		: 'hue' in color && 'whiteness' in color && 'blackness' in color
			? 'hwb'
		: 'unknown';

		if (color.colorspace === 'rgb') {
			this.color.hue = convertColors.rgb2hue(color.red, color.green, color.blue, color.hue || 0);
		}
	}

	alpha(alpha) {
		const color = this.color;

		return alpha === undefined
			? color.alpha
		: new Color(assign(color, { alpha }));
	}

	blackness(blackness) {
		const hwb = color2hwb(this.color);

		return blackness === undefined
			? hwb.blackness
		: new Color(assign(hwb, { blackness }));
	}

	blend(color, percentage, colorspace = 'rgb') {
		const base = this.color;

		return new Color(blend(base, color, percentage, colorspace));
	}

	blenda(color, percentage, colorspace = 'rgb') {
		const base = this.color;

		return new Color(blend(base, color, percentage, colorspace, true));
	}

	blue(blue) {
		const rgb = color2rgb(this.color);

		return blue === undefined
			? rgb.blue
		: new Color(assign(rgb, { blue }));
	}

	contrast(percentage) {
		const base = this.color;

		return new Color(contrast(base, percentage));
	}

	green(green) {
		const rgb = color2rgb(this.color);

		return green === undefined
			? rgb.green
		: new Color(assign(rgb, { green }));
	}

	hue(hue) {
		const hsl = color2hsl(this.color);

		return hue === undefined
			? hsl.hue
		: new Color(assign(hsl, { hue }));
	}

	lightness(lightness) {
		const hsl = color2hsl(this.color);

		return lightness === undefined
			? hsl.lightness
		: new Color(assign(hsl, { lightness }))
	}

	red(red) {
		const rgb = color2rgb(this.color);

		return red === undefined
			? rgb.red
		: new Color(assign(rgb, { red }));
	}

	rgb(red, green, blue) {
		const rgb = color2rgb(this.color);

		return new Color(assign(rgb, { red, green, blue }));
	}

	saturation(saturation) {
		const hsl = color2hsl(this.color);

		return saturation === undefined
			? hsl.saturation
		: new Color(assign(hsl, { saturation }));
	}

	shade(percentage) {
		const hwb = color2hwb(this.color);
		const shade = { hue: 0, whiteness: 0, blackness: 100, colorspace: 'hwb' };
		const colorspace = 'rgb';

		return percentage === undefined
			? hwb.blackness
		: new Color(blend(hwb, shade, percentage, colorspace));
	}

	tint(percentage) {
		const hwb = color2hwb(this.color);
		const tint = { hue: 0, whiteness: 100, blackness: 0, colorspace: 'hwb' };
		const colorspace = 'rgb';

		return percentage === undefined
			? hwb.blackness
		: new Color(blend(hwb, tint, percentage, colorspace));
	}

	whiteness(whiteness) {
		const hwb = color2hwb(this.color);

		return whiteness === undefined
			? hwb.whiteness
		: new Color(assign(hwb, { whiteness }));
	}

	toHSL() {
		return color2hslString(this.color);
	}

	toHWB() {
		return color2hwbString(this.color);
	}

	toLegacy() {
		return color2legacyString(this.color);
	}

	toRGB() {
		return color2rgbString(this.color);
	}

	toRGBLegacy() {
		return color2rgbLegacyString(this.color);
	}

	toString() {
		return color2string(this.color);
	}
}

/* Blending
/* ========================================================================== */

function blend(base, color, percentage, colorspace, isBlendingAlpha) {
	const addition    = percentage / 100;
	const subtraction = 1 - addition;

	if (colorspace === 'hsl') {
		const { hue: h1, saturation: s1, lightness: l1, alpha: a1 } = color2hsl(base);
		const { hue: h2, saturation: s2, lightness: l2, alpha: a2 } = color2hsl(color);

		const [hue, saturation, lightness, alpha] = [
			h1 * subtraction + h2 * addition,
			s1 * subtraction + s2 * addition,
			l1 * subtraction + l2 * addition,
			isBlendingAlpha
				? a1 * subtraction + a2 * addition
			: a1
		];

		return { hue, saturation, lightness, alpha, colorspace: 'hsl' };
	} else if (colorspace === 'hwb') {
		const { hue: h1, whiteness: w1, blackness: b1, alpha: a1 } = color2hwb(base);
		const { hue: h2, whiteness: w2, blackness: b2, alpha: a2 } = color2hwb(color);

		const [hue, whiteness, blackness, alpha] = [
			h1 * subtraction + h2 * addition,
			w1 * subtraction + w2 * addition,
			b1 * subtraction + b2 * addition,
			isBlendingAlpha
				? a1 * subtraction + a2 * addition
			: a1
		];

		return { hue, whiteness, blackness, alpha, colorspace: 'hwb' };
	} else {
		const { red: r1, green: g1, blue: b1, alpha: a1 } = color2rgb(base);
		const { red: r2, green: g2, blue: b2, alpha: a2 } = color2rgb(color);

		const [red, green, blue, alpha] = [
			r1 * subtraction + r2 * addition,
			g1 * subtraction + g2 * addition,
			b1 * subtraction + b2 * addition,
			isBlendingAlpha
				? a1 * subtraction + a2 * addition
			: a1
		];

		return { red, green, blue, alpha, colorspace: 'rgb' };
	}
}

/* Assign channels to a new instance of a base color
/* ========================================================================== */

function assign(base, channels) {
	const color = Object.assign({}, base);

	Object.keys(channels).forEach(
		channel => {
			// detect channel
			const channelIsHue = channel === 'hue';
			const isRGB = !channelIsHue && blueGreenRedMatch.test(channel);

			// normalized value of the channel
			const value = normalize(channels[channel], channel);

			// assign channel to new object
			color[channel] = value;

			if (isRGB) {
				// conditionally preserve the hue
				color.hue = convertColors.rgb2hue(color.red, color.green, color.blue, base.hue || 0);
			}
		}
	);

	return color;
}

function normalize(value, channel) {
	// detect channel
	const channelIsHue = channel === 'hue';

	// value limitations
	const min = 0;
	const max = channelIsHue ? 360 : 100;

	const normalizedValue = Math.min(Math.max(channelIsHue
		? value % 360
	: value, min), max);

	return normalizedValue;
}

/* Convert colors
/* ========================================================================== */

function color2rgb(color) {
	const [ red, green, blue ] = color.colorspace === 'hsl'
		? convertColors.hsl2rgb(color.hue, color.saturation, color.lightness)
	: color.colorspace === 'hwb'
		? convertColors.hwb2rgb(color.hue, color.whiteness, color.blackness)
	: [ color.red, color.green, color.blue ];

	return { red, green, blue, hue: color.hue, alpha: color.alpha, colorspace: 'rgb' };
}

function color2hsl(color) {
	const [ hue, saturation, lightness ] = color.colorspace === 'rgb'
		? convertColors.rgb2hsl(color.red, color.green, color.blue, color.hue)
	: color.colorspace === 'hwb'
		? convertColors.hwb2hsl(color.hue, color.whiteness, color.blackness)
	: [ color.hue, color.saturation, color.lightness ];

	return { hue, saturation, lightness, alpha: color.alpha, colorspace: 'hsl' };
}

function color2hwb(color) {
	const [ hue, whiteness, blackness ] = color.colorspace === 'rgb'
		? convertColors.rgb2hwb(color.red, color.green, color.blue, color.hue)
	: color.colorspace === 'hsl'
		? convertColors.hsl2hwb(color.hue, color.saturation, color.lightness)
	: [ color.hue, color.whiteness, color.blackness ];

	return { hue, whiteness, blackness, alpha: color.alpha, colorspace: 'hwb' };
}

/* Contrast functions
/* ========================================================================== */

function contrast(color, percentage) {
	// https://drafts.csswg.org/css-color/#contrast-adjuster
	const hwb = color2hwb(color);
	const rgb = color2rgb(color);

	// compute the luminance of the color.
	const luminance = rgb2luminance(rgb.red, rgb.green, rgb.blue);

	// the maximum-contrast color, if it is less than .5
	const maxContrastColor = luminance < 0.5
		// hwb(X, 100%, 0%), where X is the hue angle of the color
		? { hue: hwb.hue, whiteness: 100, blackness: 0, alpha: hwb.alpha, colorspace: 'hwb' }
	// otherwise, hwb(X, 0%, 100%), where X is the hue angle of the color
	: { hue: hwb.hue, whiteness: 0, blackness: 100, alpha: hwb.alpha, colorspace: 'hwb' };

	// contrast ratio
	const contrastRatio = colors2contrast(color, maxContrastColor);

	const minContrastColor = contrastRatio > 4.5
		// the color with the smallest contrast ratio with the base color that is greater than 4.5
		? colors2contrastRatioColor(hwb, maxContrastColor)
	// otherwise, the maximum-contrast color
	: maxContrastColor;

	// color(maximum-contrast blend(minimum-contrast <percentage> hwb)));
	return blend(maxContrastColor, minContrastColor, percentage, 'hwb', false);
}

function colors2contrast(color1, color2) {
	// https://drafts.csswg.org/css-color/#contrast-ratio
	const rgb1 = color2rgb(color1);
	const rgb2 = color2rgb(color2);
	const l1 = rgb2luminance(rgb1.red, rgb1.green, rgb1.blue);
	const l2 = rgb2luminance(rgb2.red, rgb2.green, rgb2.blue);

	return l1 > l2
		// if l1 is the relative luminance of the lighter of the colors
		? (l1 + 0.05) / (l2 + 0.05)
	// otherwise, if l2 is the relative luminance of the lighter of the colors
	: (l2 + 0.05) / (l1 + 0.05);
}

function rgb2luminance(red, green, blue) {
	const [ redLuminance, greenLuminance, blueLuminance ] = [
		channel2luminance(red),
		channel2luminance(green),
		channel2luminance(blue)
	];

	// https://drafts.csswg.org/css-color/#luminance
	const luminance = 0.2126 * redLuminance + 0.7152 * greenLuminance + 0.0722 * blueLuminance;

	return luminance;
}

function channel2luminance(value) {
	// https://drafts.csswg.org/css-color/#luminance
	const luminance = value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) /1.055, 2.4);

	return luminance;
}

// return the smallest contrast ratio from a color and a maximum contrast (credit: @thetalecrafter)
function colors2contrastRatioColor(hwb, maxHWB) {
	const modifiedHWB = Object.assign({}, hwb);

	// values to be used for linear interpolations in HWB space
	let minW = hwb.whiteness;
	let minB = hwb.blackness;
	let maxW = maxHWB.whiteness;
	let maxB = maxHWB.blackness;

	// find the color with the smallest contrast ratio with the base color that is greater than 4.5
	while (Math.abs(minW - maxW) > 100 || Math.abs(minB - maxB) > 100) {
		const midW = Math.round((maxW + minW) / 2);
		const midB = Math.round((maxB + minB) / 2);

		modifiedHWB.whiteness = midW;
		modifiedHWB.blackness = midB;

		if (colors2contrast(modifiedHWB, hwb) > 4.5) {
			maxW = midW;
			maxB = midB;
		} else {
			minW = midW;
			minB = midB;
		}
	}

	return modifiedHWB;
}

/* Match
/* ========================================================================== */

const blueGreenRedMatch = /^(blue|green|red)$/i;

/* Stringifiers
/* ========================================================================== */

function color2string(color) {
	return color.colorspace === 'hsl'
		? color2hslString(color)
	: color.colorspace === 'hwb'
		? color2hwbString(color)
	: color2rgbString(color);
}

function color2hslString(color) {
	const hsl        = color2hsl(color);
	const isOpaque   = hsl.alpha === 100;
	const hue        = hsl.hue;
	const saturation = Math.round(hsl.saturation * 10000000000) / 10000000000;
	const lightness  = Math.round(hsl.lightness * 10000000000) / 10000000000;
	const alpha      = Math.round(hsl.alpha * 10000000000) / 10000000000;

	return `hsl(${hue} ${saturation}% ${lightness}%${isOpaque
		? ''
	: ` / ${alpha}%`})`;
}

function color2hwbString(color) {
	const hwb       = color2hwb(color);
	const isOpaque  = hwb.alpha === 100;
	const hue       = hwb.hue;
	const whiteness = Math.round(hwb.whiteness * 10000000000) / 10000000000;
	const blackness = Math.round(hwb.blackness * 10000000000) / 10000000000;
	const alpha     = Math.round(hwb.alpha * 10000000000) / 10000000000;

	return `hwb(${hue} ${whiteness}% ${blackness}%${isOpaque
		? ''
	: ` / ${alpha}%`})`;
}

function color2rgbString(color) {
	const rgb      = color2rgb(color);
	const isOpaque = rgb.alpha === 100;
	const red      = Math.round(rgb.red * 10000000000) / 10000000000;
	const green    = Math.round(rgb.green * 10000000000) / 10000000000;
	const blue     = Math.round(rgb.blue * 10000000000) / 10000000000;
	const alpha    = Math.round(rgb.alpha * 10000000000) / 10000000000;

	return `rgb(${red}% ${green}% ${blue}%${isOpaque
		? ''
	: ` / ${alpha}%`})`;
}

function color2legacyString(color) {
	return color.colorspace === 'hsl'
		? color2hslLegacyString(color)
	: color2rgbLegacyString(color);
}

function color2rgbLegacyString(color) {
	const rgb      = color2rgb(color);
	const isOpaque = rgb.alpha === 100;
	const name     = isOpaque ? 'rgb' : 'rgba';
	const red      = Math.round(rgb.red * 255 / 100);
	const green    = Math.round(rgb.green * 255 / 100);
	const blue     = Math.round(rgb.blue * 255 / 100);
	const alpha    = Math.round(rgb.alpha / 100 * 10000000000) / 10000000000;

	return `${name}(${red}, ${green}, ${blue}${isOpaque
		? ''
	: `, ${alpha}`})`;
}

function color2hslLegacyString(color) {
	const hsl        = color2hsl(color);
	const isOpaque   = hsl.alpha === 100;
	const name       = isOpaque ? 'hsl' : 'hsla';
	const hue        = hsl.hue;
	const saturation = Math.round(hsl.saturation * 10000000000) / 10000000000;
	const lightness  = Math.round(hsl.lightness * 10000000000) / 10000000000;
	const alpha      = Math.round(hsl.alpha / 100 * 10000000000) / 10000000000;

	return `${name}(${hue}, ${saturation}%, ${lightness}%${isOpaque
		? ''
	: `, ${alpha}`})`;
}

function manageUnresolved(node, opts, word, message) {
	if ('warn' === opts.unresolved) {
		opts.decl.warn(opts.result, message, { word });
	} else if ('ignore' !== opts.unresolved) {
		throw opts.decl.error(message, { word });
	}
}

// tooling

/* Transform AST
/* ========================================================================== */

function transformAST(node, opts) {
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

module.exports = (opts = {}) => {
	// how unresolved functions and arguments should be handled (default: "throw")
	const unresolvedOpt = String(Object(opts).unresolved || 'throw').toLowerCase();

	// how transformed colors will be produced in CSS
	const stringifierOpt = Object(opts).stringifier || (color => color.toLegacy());

	// sources to import custom selectors from
	const importFrom = [].concat(Object(opts).importFrom || []);

	// whether var() within color-mod() should use Custom Properties or var() fallback
	const transformVarsOpt = 'transformVars' in Object(opts) ? opts.transformVars : true;

	// promise any custom selectors are imported
	const customPropertiesPromise = importCustomPropertiesFromSources(importFrom);

	return {
		postcssPlugin: 'postcss-color-mod-function',
		async Once (root, { result }) {
			const customProperties = Object.assign(
				await customPropertiesPromise,
				getCustomProperties(root, { preserve: true })
			);

			root.walkDecls(decl => {
				const originalValue = decl.value;

				if (colorModFunctionMatch.test(originalValue)) {
					const ast = parser(originalValue);

					transformAST(ast, {
						unresolved: unresolvedOpt,
						stringifier: stringifierOpt,
						transformVars: transformVarsOpt,
						decl,
						result,
						customProperties
					});

					const modifiedValue = parser.stringify(ast);

					if (originalValue !== modifiedValue) {
						decl.value = modifiedValue;
					}
				}
			});
		}
	};
};

module.exports.postcss = true;

const colorModFunctionMatch = /(^|[^\w-])color-mod\(/i;
//# sourceMappingURL=index.cjs.js.map
