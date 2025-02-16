import livelyProperties from '../LivelyProperties.json' with { type: 'json' }

// location.search will only be empty when the wallpaper is first launched, because then we will immediately reload with a query string
const firstLaunch = !location.search

let options = null
let livelyDefaults = {}
let initTimeout = false

const LOGGING = false
function log(str) {
	if (LOGGING) {
		console.log(str)
	}
}

function getQueryFromObject(obj) {
	let pairs = Object.entries(obj).filter(([k,v]) => (!["advancedArguments"].includes(k))).map(([k,v]) => (`${k}=${v}`))

	if (obj["advancedArguments"]) {
		pairs.push(`beginAdvancedArgs=1&${obj["advancedArguments"]}`)
	}
	if (!("firstload" in obj)) {
		pairs.push("firstload=false")
	}
	return `?${pairs.join("&")}`
}

function populateDefaults() {
	log("Populating defaults from LivelyProperties.json")

	for (const [k,v] of Object.entries(livelyProperties)) {
		switch (v.type) {
			case "label":
			case "button":
				// Ignore these
				break

			case "dropdown":
				// Convert the index to the string value
				livelyDefaults[k] = v.items[v.value]
				break

			case "color":
				// Convert the #RRGGBB format into R,G,B (0-1)
				livelyDefaults[k] = convertColor(v.value)
				break

			default:
				livelyDefaults[k] = v.value
				break
		}
	}
}

function initOptions() {
	log("INIT")

	populateDefaults()

	// Stop any options from getting set for 100ms after initialization
	// This is because after a reload, lively will call livelyPropertyListener on all the options that are fully saved (i.e. the configuration window has closed)
	// But we don't want this to happen when we click "save", only when the wallpaper is launched for the first time
	if (!firstLaunch) {
		// If location.search is non-empty this means it is not the first launch of the wallpaper, so we do want to ignore the initialization
		log("Setting timeout")
		initTimeout = true
		setTimeout(() => {
			initTimeout = false
			log("Cleared timeout")
		}, 100)
	}

	let advancedArgsSection = false
	let advancedArgs = {}

	let urlParams = new URLSearchParams(window.location.search)
	for (const [k, v] of urlParams) {
		if (k == "beginAdvancedArgs") {
			advancedArgsSection = true
		} else if (!advancedArgsSection) {
			options[k] = v
		} else {
			advancedArgs[k] = v
		}
	}
	if (Object.keys(advancedArgs).length) {
		options["advancedArguments"] = Object.entries(advancedArgs).map(([k,v]) => (`${k}=${v}`)).join("&")
	}
}

function convertColor(value) {
	// Convert from a #RRGGBB to a comma separated value R,G,B (0-1)
	let r = parseInt(value.substring(1,3), 16) / 255
	let g = parseInt(value.substring(3,5), 16) / 255
	let b = parseInt(value.substring(5), 16) / 255
	return `${r},${g},${b}`
}

function livelyPropertyListener(name, value) {
	// At first launch (and when the wallpaper is reloaded by us), this function is called for every property
	// in the order they are specified in the LivelyProperties.json file
	// When a user is customizing the properties in Lively, this is called every time a value is changed

	if (options == null) {
		options = {}
		initOptions()
	}

	if (initTimeout) {
		// If we just reloaded then we want to ignore all the property updates that lively sends us for the saved values
		return
	}

	switch (true) {
		case name == "reload":
		case name == "reload2":
			break

		case (name in livelyProperties && livelyProperties[name].type == "dropdown"):
			options[name] = livelyProperties[name].items[parseInt(value)]
			break

		case (name in livelyProperties && livelyProperties[name].type == "color"):
			options[name] = convertColor(value)
			break

		default:
			options[name] = value
			break
	}

  if (["reload","reload2"].includes(name) || (name == "advancedArguments" && firstLaunch)) {
		// If the reload button is pressed or we are done reading in all of the options for the first launch

		// Pre-process options

		// Filter out non-default values
		// Don't filter stripeColor/stripeEnable options as those are handled specially
		let filtered = Object.fromEntries(
			Object.entries(options)
				.filter(([k,v]) => (v != livelyDefaults[k] && k != "stripeColors") || (k.match(/stripe.(Color|Enable)/) != null))
		)

		// The stripes are handled specially
		if (options.effect == "stripes") {
			let stripeColors = []

			const numStripeKeys = Object.keys(livelyDefaults).filter((k) => k.startsWith("stripe") && k.endsWith("Color")).length
			for (let i = 1; i <= numStripeKeys; i++) {
				if (options[`stripe${i}Enable`] == true || options[`stripe${i}Enable`] == "true") {
					stripeColors.push(options[`stripe${i}Color`])
				}
			}
			if (stripeColors.length) {
				filtered["stripeColors"] = stripeColors.join(",")
			}
		}

		// Form the final query to reload to
		let query = getQueryFromObject(filtered)
		if (location.search != query) {
			log("RELOADING")
			log(`location.search=${location.search}`)
			log(`query=${query}`)
			location.replace(query)
		} else {
			log("NOT RELOADING: query unchanged")
		}
  }
}

// Export to global namespace
window.livelyPropertyListener = livelyPropertyListener
