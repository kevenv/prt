'use strict'

// Constants
var WINDOW_WIDTH = 800;
var WINDOW_HEIGHT = 600;
var ALBEDO = new Array(2);
ALBEDO[0] = new THREE.Vector3(1,0,0);
ALBEDO[1] = new THREE.Vector3(1,1,1);
var N_COEFFS = 9;
var N_MONTE_CARLO = 100;
var RAY_OFFSET = 1e-18;
var PRECOMPUTE_FILE_NAME = "prt_precomputed.json";

// Globals
var scene = null;
var camera = null;
var renderer = null;
var controls = null;
var bvh = null;
var objects = [];

var L = [];
var PRTCache = []; // list of G
var PRTCacheGood = false;
var PRECOMPUTE_FILE_PATH = "";

var L_r = 1.5;
var L_d = 1.7;
var L_INTENSITY = 1.0;
var L_DIR = new THREE.Vector3(0,0,1);
var L_ANGLE = 90.0;

// Events
document.addEventListener("load", onLoad());

function onLoad() {
	initControls();
	onInit();
}

function onRender() {
	requestAnimationFrame(onRender);
	onUpdate();
	renderer.render(scene, camera);
}

function onInit() {
	renderer = new THREE.WebGLRenderer();
	renderer.setSize(WINDOW_WIDTH, WINDOW_HEIGHT);
	document.body.appendChild(renderer.domElement);

	scene = new THREE.Scene();
	camera = new THREE.PerspectiveCamera(50, WINDOW_WIDTH/WINDOW_HEIGHT, 0.1, 1000);
	// camera
	camera.up.set(0,0,1);
	camera.position.x = 7.54;
	camera.position.y = 3.77;
	camera.position.z = 7.54;
	camera.lookAt(new THREE.Vector3(0,0,0));

	// controls
	controls = new THREE.OrbitControls(camera, renderer.domElement);

	// 3D-axis
	var K = 10;
	var matX = new THREE.LineBasicMaterial({color:0xff0000});
	var matY = new THREE.LineBasicMaterial({color:0x00ff00});
	var matZ = new THREE.LineBasicMaterial({color:0x0000ff});
	var geometryX = new THREE.Geometry();
	geometryX.vertices.push(new THREE.Vector3(0, 0, 0));
	geometryX.vertices.push(new THREE.Vector3(K, 0, 0));
	var lineX = new THREE.Line(geometryX, matX);
	scene.add(lineX);
	var geometryY = new THREE.Geometry();
	geometryY.vertices.push(new THREE.Vector3(0, 0, 0));
	geometryY.vertices.push(new THREE.Vector3(0, K, 0));
	var lineY = new THREE.Line(geometryY, matY);
	scene.add(lineY);
	var geometryZ = new THREE.Geometry();
	geometryZ.vertices.push(new THREE.Vector3(0, 0, 0));
	geometryZ.vertices.push(new THREE.Vector3(0, 0, K));
	var lineZ = new THREE.Line(geometryZ, matZ);
	scene.add(lineZ);

	// shader
	var basicShader = new THREE.ShaderMaterial( {
		vertexShader : "attribute vec3 mycolor; varying vec3 vColor; void main() { vColor = mycolor; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
		fragmentShader : "varying vec3 vColor; void main() { gl_FragColor = vec4(vColor,1.0); }"
	});

	// plane
	var geometry = new THREE.PlaneBufferGeometry(10,10,100,100);
	var plane = new THREE.Mesh(geometry, basicShader);
	createColorAttrib(plane, new THREE.Vector3(0.0,1.0,0.0));
	scene.add(plane);

	// teapot
	var loader = new THREE.OBJLoader();
	loader.load('assets/teapot.obj', function(object) {
		var teapot = object.children[0];

		// shader
		teapot.material = basicShader;
		createColorAttrib(teapot, new THREE.Vector3(1.0,0.0,0.0));

		// position + rotation
		var rotMat = new THREE.Matrix4();
		rotMat.makeRotationX(Math.PI/2);

		var verts = teapot.geometry.getAttribute("position");
		var N_VERTS = verts.count;
		verts = verts.array;
		for(var v = 0; v < N_VERTS; v++) {
			var vert = new THREE.Vector3(verts[v*3+0], verts[v*3+1], verts[v*3+2]);
			vert.applyMatrix4(rotMat);
			verts[v*3+0] = vert.x;
			verts[v*3+1] = vert.y;
			verts[v*3+2] = vert.z + 1.5;
		}

		scene.add(object);
		
		console.log('loaded teapot');

		objects.push(plane);
		objects.push(teapot);

		// init
		buildBVH(objects);
		precomputeL();
		onRender();
	});
}

function createColorAttrib(mesh, color) {
	var verts = mesh.geometry.getAttribute("position");
	var N_VERTS = verts.count;
	var colors = new Float32Array(N_VERTS * 3);
	for(var i = 0; i < N_VERTS; i++) {
		colors[i*3+0] = color.x;
		colors[i*3+1] = color.y;
		colors[i*3+2] = color.z;
	}
	mesh.geometry.addAttribute("mycolor", new THREE.BufferAttribute(colors, 3));
}

function buildBVH(objects) {
	console.log("build bvh...");

	var triangles = [];

	for(var i = 0; i < objects.length; i++) {
		var verts = objects[i].geometry.getAttribute("position");
		var N_VERTS = verts.count;
		var verts = verts.array;
		for(var k = 0; k < N_VERTS*3; k+=3*3) {
			var v0 = new THREE.Vector3(verts[k+0], verts[k+1], verts[k+2]);
			var v1 = new THREE.Vector3(verts[k+3], verts[k+4], verts[k+5]);
			var v2 = new THREE.Vector3(verts[k+6], verts[k+7], verts[k+8]);
			var triangle = [
				{x: v0.x, y: v0.y, z: v0.z},
				{x: v1.x, y: v1.y, z: v1.z},
				{x: v2.x, y: v2.y, z: v2.z},
			];
			triangles.push(triangle);
		}
	}

	// the maximum number of triangles that can fit in a node before splitting it.
	var maxTrianglesPerNode = 7;
	bvh = new bvhtree.BVH(triangles, maxTrianglesPerNode);

	console.log("[done]");
}

function precomputeL() {
	console.log("compute L...");
	computeL_env_proj(L_r, L_d, L_DIR);
	console.log("[done]");
}

function precomputeG(useCache) {
	PRTCacheGood = false;

	if(useCache) {
		readJson(PRECOMPUTE_FILE_PATH, function(data) {
			PRTCache = data;
			PRTCacheGood = true;
		});
	}
	else {
		// do precomputations
		var samples = new Array(N_MONTE_CARLO);
		createSamples(N_MONTE_CARLO, samples);

		console.log("compute G...");

		PRTCache = [];

		for(var j = 0; j < objects.length; j++) {
			var obj = objects[j];
			var verts = obj.geometry.getAttribute("position");
			var normals = obj.geometry.getAttribute("normal");
			var N_VERTS = verts.count;
			var G = new Array(N_VERTS);
			for(var i = 0; i < G.length; i++) {
				G[i] = new Array(N_COEFFS);
				for(var k = 0; k < N_COEFFS; k++) {
					G[i][k] = 0.0;
				}
			}

			for(var v = 0; v < N_VERTS; v++) {
				computeG(G, v, verts.array, normals.array, samples);
			}

			PRTCache.push(G);
		}

		console.log("[done]");
		PRTCacheGood = true;
	}
}

function computeG(G, v, verts, normals, samples) {
	var p = new THREE.Vector3(verts[v*3+0],verts[v*3+1],verts[v*3+2]);
	var n = new THREE.Vector3(normals[v*3+0],normals[v*3+1],normals[v*3+2]);

	// offset ray
	var n_ = n.clone();
	n_.multiplyScalar(RAY_OFFSET);
	p.add(n_);
	
	for(var i = 0; i < N_MONTE_CARLO; i++) {
		//console.log("v= " + v + " MC = " + (i+1));

		var w = samples[i].clone();
		//w.add(p);//to world space
		w.normalize();
		var cosTheta = Math.max(0.0, w.dot(n));
		if(cosTheta == 0.0) continue;
		var pWi = 1.0 / (4.0 * Math.PI);
		var V = bvh.intersectRay(p, w, true).length == 0;
		if(V) {
			var yi = SHEval3(w.x, w.y, w.z);
			for(var k = 0; k < N_COEFFS; k++) {
				G[v][k] += cosTheta * yi[k];
			}
		}
	}

	for(var k = 0; k < N_COEFFS; k++) {
		G[v][k] *= 1.0 / (Math.PI * N_MONTE_CARLO * pWi);
	}
}

function createSamples(N, samples) {
	for(var i = 0; i < N; i++) {
		var sample = new THREE.Vector2(Math.random(), Math.random());
		samples[i] = squareToUniformSphere(sample);
		//console.log(sample.x + "," + sample.y + ": " + samples[i].x + "," + samples[i].y + "," + samples[i].z);
	}
}

function squareToUniformSphere(sample) {
	var z = 1.0 - 2.0 * sample.x;
	var r = Math.sqrt(Math.max(0.0, 1.0 - z*z));
	var phi = 2.0 * Math.PI * sample.y;
	return new THREE.Vector3(r * Math.cos(phi), r * Math.sin(phi), z);
}

function computeL_env_proj(r, d, dir) {
	var L0 = computeL0_env_proj(r,d);
	var y = SHEval3(dir.x, dir.y, dir.z);
	var Lr = new Array(N_COEFFS);
	for(var l = 0; l <= 2; l++) {
		for(var m = -l; m <= l; m++) {
			var i = l*(l+1) + m;
			Lr[i] = Math.sqrt(4*Math.PI / (2*l + 1)) * L0[l*(l+1)] * y[i];
		}
	}
	L = Lr;
}

function computeL0_env_proj(r, d) {
	// up = z
	// based on sh.nb
	var L0 = new Array(N_COEFFS);

	L0[0] = Math.sqrt(Math.PI) * (1 - Math.sqrt(1 - (r*r)/(d*d)));
	L0[1] = 0.0;
	L0[2] = (Math.sqrt(3*Math.PI) * r*r) / (2*d*d);
	L0[3] = 0.0;
	L0[4] = 0.0;
	L0[5] = 0.0;
	L0[6] = (Math.sqrt(5*Math.PI) * r*r * Math.sqrt(1 - (r*r)/(d*d))) / (2*d*d);
	L0[7] = 0.0;
	L0[8] = 0.0;

	return L0;
}

function onUpdate() {	
	controls.update();

	if(!PRTCacheGood) return;

	for(var j = 0; j < objects.length; j++) {
		var obj = objects[j];
		var G = PRTCache[j];
		var verts = obj.geometry.getAttribute("mycolor");
		for(var v = 0; v < verts.count; v++) {
			verts.array[v*3+0] = 0.0;
			verts.array[v*3+1] = 0.0;
			verts.array[v*3+2] = 0.0;
			for(var i = 0; i < N_COEFFS; i++) {
				var k = L_INTENSITY * L[i] * G[v][i];
				k = Math.max(0.0,k);
				k = Math.min(1.0,k);
				verts.array[v*3+0] += k * ALBEDO[j].x;
				verts.array[v*3+1] += k * ALBEDO[j].y;
				verts.array[v*3+2] += k * ALBEDO[j].z;
			}
		}

		verts.needsUpdate = true;
	}
}

// JSON file read/write
function writeJson(object, name, type) {
	var text = JSON.stringify(object);
	var a = document.createElement("a");
	var file = new Blob([text], {type: type});
	a.href = URL.createObjectURL(file);
	a.download = name;
	a.click();
}

function readJson(file, callback) {
    var rawFile = new XMLHttpRequest();
    rawFile.overrideMimeType("application/json");
    rawFile.open("GET", file, true);
    rawFile.onreadystatechange = function() {
        if (rawFile.readyState === 4) {
            var data = JSON.parse(rawFile.responseText);
            callback(data);
        }
    }
    rawFile.send(null);
}

function initControls() {
	var text_L_intensity = document.getElementById("text_L_intensity");
	text_L_intensity.value = L_INTENSITY;

	var text_L_direction = document.getElementById("text_L_direction");
	text_L_direction.value = L_ANGLE;
	L_DIR = computeLightDir(L_ANGLE);

	var text_L_r = document.getElementById("text_L_r");
	text_L_r.value = L_r;

	var text_L_d = document.getElementById("text_L_d");
	text_L_d.value = L_d;

	var text_montecarlo = document.getElementById("text_montecarlo");
	text_montecarlo.value = N_MONTE_CARLO;

	var text_savePRT = document.getElementById("text_savePRT");
	text_savePRT.value = PRECOMPUTE_FILE_NAME;

	var sliderIntensity = document.getElementById("slider_L_intensity");
	sliderIntensity.defaultValue = L_INTENSITY;
	sliderIntensity.min = 0.0;
	sliderIntensity.max = 3.0;
	sliderIntensity.step = 0.1;
	sliderIntensity.addEventListener("input", function() {
		L_INTENSITY = parseFloat(sliderIntensity.value);
		var text_L_intensity = document.getElementById("text_L_intensity");
		text_L_intensity.value = L_INTENSITY;
	});

	var sliderDirection = document.getElementById("slider_L_direction");
	sliderDirection.defaultValue = L_ANGLE;
	sliderDirection.min = 0.0;
	sliderDirection.max = 180.0;
	sliderDirection.step = 5.0;
	sliderDirection.addEventListener("input", function() {
		L_ANGLE = parseFloat(sliderDirection.value);
		var text_L_direction = document.getElementById("text_L_direction");
		text_L_direction.value = L_ANGLE;
		L_DIR = computeLightDir(L_ANGLE);
		precomputeL();
	});

	var sliderL_r = document.getElementById("slider_L_r");
	sliderL_r.defaultValue = L_r;
	sliderL_r.min = 0.0;
	sliderL_r.max = 3.0;
	sliderL_r.step = 0.1;
	sliderL_r.addEventListener("input", function() {
		L_r = parseFloat(sliderL_r.value);
		var text_L_r = document.getElementById("text_L_r");
		text_L_r.value = L_r;
		precomputeL();
	});

	var sliderL_d = document.getElementById("slider_L_d");
	sliderL_d.defaultValue = L_d;
	sliderL_d.min = 0.0;
	sliderL_d.max = 3.0;
	sliderL_d.step = 0.1;
	sliderL_d.addEventListener("input", function() {
		L_d = parseFloat(sliderL_d.value);
		var text_L_d = document.getElementById("text_L_d");
		text_L_d.value = L_d;
		precomputeL();
	});

	var slider_montecarlo = document.getElementById("slider_montecarlo");
	slider_montecarlo.defaultValue = N_MONTE_CARLO;
	slider_montecarlo.min = 0;
	slider_montecarlo.max = 1000;
	slider_montecarlo.step = 100;
	slider_montecarlo.addEventListener("input", function() {
		N_MONTE_CARLO = parseFloat(slider_montecarlo.value);
		var text_montecarlo = document.getElementById("text_montecarlo");
		text_montecarlo.value = N_MONTE_CARLO;
	});

	text_montecarlo.addEventListener("change", function() {
		N_MONTE_CARLO = parseFloat(text_montecarlo.value);
		slider_montecarlo.value = N_MONTE_CARLO;
	});

	var button_computePRT = document.getElementById("button_computePRT");
	button_computePRT.addEventListener("click", function() {
		precomputeG(false);
	});

	var button_savePRT = document.getElementById("button_savePRT");
	button_savePRT.addEventListener("click", function() {
		var text_savePRT = document.getElementById("text_savePRT");
		PRECOMPUTE_FILE_NAME = text_savePRT.value;
		if(PRTCacheGood) {
			writeJson(PRTCache, PRECOMPUTE_FILE_NAME, 'text/plain');
		}
	});

	var button_loadPRT = document.getElementById("button_loadPRT");
	button_loadPRT.addEventListener("click", function() {
		var file_loadPRT = document.getElementById("file_loadPRT");
		PRECOMPUTE_FILE_NAME = file_loadPRT.value.substring(12,file_loadPRT.value.length);

		var text_savePRT = document.getElementById("text_savePRT");
		text_savePRT.value = PRECOMPUTE_FILE_NAME;
		
		var loc = window.location.pathname;
		var dir = loc.substring(0, loc.lastIndexOf('/'));
		PRECOMPUTE_FILE_PATH = dir + "/" + PRECOMPUTE_FILE_NAME;
		precomputeG(true);
	});
}

function computeLightDir(angleDeg) {
	var v = new THREE.Vector3(0,1,0); // at 0 deg
	var rotMat = new THREE.Matrix4();
	rotMat.makeRotationX(toRadians(angleDeg));
	v.applyMatrix4(rotMat);
	return v;
}

function toRadians(deg) {
	return deg * Math.PI / 180;
};