'use strict'

// Constants
var WINDOW_WIDTH = 800;
var WINDOW_HEIGHT = 600;
var ALBEDO = 1.0;
var USE_CACHE = false;
var N_COEFFS = 9;
var N_MONTE_CARLO = 50;
var PRECOMPUTE_FILE_NAME = "prt_precomputed.json";

var loc = window.location.pathname;
var dir = loc.substring(0, loc.lastIndexOf('/'));
var PRECOMPUTE_FILE_PATH = dir + "/" + PRECOMPUTE_FILE_NAME;

// Globals
var scene = null;
var camera = null;
var renderer = null;
var controls = null;
var bvh = null;
var teapot = null;
var plane = null;

var L = [];
var PRTCache = []; // list of G

// Events
document.addEventListener("load", onLoad());

function onLoad() {	
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

	// plane
	var geometry = new THREE.PlaneGeometry(10,10,100,100);
	var materialPlane = new THREE.MeshBasicMaterial( {color: 0x00ff00, side: THREE.DoubleSide} );
	plane = new THREE.Mesh(geometry, materialPlane);
	scene.add(plane);

	// teapot
	var loader = new THREE.OBJLoader();
	loader.load('assets/teapot.obj', function(object) {
		teapot = object.children[0];

		// create color attrib
		var verts = teapot.geometry.getAttribute("position");
		var N_VERTS = verts.count;
		var colors = new Float32Array(N_VERTS * 3);
		for(var i = 0; i < N_VERTS; i++) {
			colors[i*3+0] = 1.0;
			colors[i*3+1] = 0.0;
			colors[i*3+2] = 0.0;
		}
		teapot.geometry.addAttribute("mycolor", new THREE.BufferAttribute(colors, 3));

		// create shader
		teapot.material = new THREE.ShaderMaterial( {
			vertexShader : "attribute vec3 mycolor; varying vec3 vColor; void main() { vColor = mycolor; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
			fragmentShader : "varying vec3 vColor; void main() { gl_FragColor = vec4(vColor,1.0); }"
		});

		// position
		object.rotation.x = Math.PI/2;
		object.position.z = 1.5;

		scene.add(object);
		
		console.log('loaded teapot');

		// init
		buildBVH([teapot, plane]);
		precomputeL();
		precomputeG();
		onRender();
	});
}

function buildBVH(objects) {
	console.log("build bvh...");

	var triangles = [];

	for(var i = 0; i < objects.length; i++) {
		if(objects[i].geometry.vertices != null) {
			var verts = objects[i].geometry.vertices;
			var tri = objects[i].geometry.faces;
			for(var k = 0; k < tri.length; k++) {
				var v0 = verts[tri[k].a];
				var v1 = verts[tri[k].b];
				var v2 = verts[tri[k].c];
				var triangle = [
					{x: v0.x, y: v0.y, z: v0.z},
					{x: v1.x, y: v1.y, z: v1.z},
					{x: v2.x, y: v2.y, z: v2.z},
				];
				triangles.push(triangle);
			}
		}
		else {
			var verts = objects[i].geometry.getAttribute("position").array;
			for(var k = 0; k < verts.count*3; k+=9) {
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
	}

	// the maximum number of triangles that can fit in a node before splitting it.
	var maxTrianglesPerNode = 7;
	bvh = new bvhtree.BVH(triangles, maxTrianglesPerNode);

	console.log("[done]");
}

function precomputeL() {
	console.log("compute L...");
	computeL_env_proj(1.0, 3.5)
	console.log("[done]");
}

function precomputeG() {
	if(USE_CACHE) {
		readJson(PRECOMPUTE_FILE_PATH, function(data) {
			PRTCache = data;
		});
	}
	else {
		// do precomputations
		var samples = new Array(N_MONTE_CARLO);
		createSamples(N_MONTE_CARLO, samples);

		console.log("compute G...");

		var verts = teapot.geometry.getAttribute("position");
		var normals = teapot.geometry.getAttribute("normal");
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

		writeJson(PRTCache, PRECOMPUTE_FILE_NAME, 'text/plain');

		console.log("[done]");
	}
}

function computeG(G, v, verts, normals, samples) {
	var p = new THREE.Vector3(verts[v*3+0],verts[v*3+1],verts[v*3+2]);
	var n = new THREE.Vector3(normals[v*3+0],normals[v*3+1],normals[v*3+2]);

	for(var i = 0; i < N_MONTE_CARLO; i++) {
		console.log("v= " + v + " MC = " + (i+1));

		var w = samples[i].clone();
		//w.add(p);//to world space
		w.normalize();
		var cosTheta = Math.max(0.0, w.dot(n));
		var pWi = 1.0 / (4 * Math.PI);
		var its = bvh.intersectRay(p, w, true);
		var V = its.length == 0;
		if(V) {
			var yi = SHEval3(w.x, w.y, w.z);
			for(var k = 0; k < N_COEFFS; k++) {
				G[v][k] += cosTheta * yi[k];
			}
		}
	}
	G[v][k] *= ALBEDO / (Math.PI * N_MONTE_CARLO * pWi);
}

function createSamples(N, samples) {
	for(var i = 0; i < N; i++) {
		var sample = new THREE.Vector2(Math.random(), Math.random());
		samples[i] = squareToUniformSphere(sample);
	}
}

function squareToUniformSphere(sample) {
	var z = 1.0 - 2.0 * sample.x;
	var r = Math.sqrt(Math.max(0.0, 1.0 - z*z));
	var phi = 2.0 * Math.PI * sample.y;
	return new THREE.Vector3(r * Math.cos(phi), r * Math.sin(phi), z);
}

function computeL_env_proj(r, d) {
	// up = z
	// based on sh.nb
	L[0] = Math.sqrt(Math.PI) * (1 - Math.sqrt(1 - (r*r)/(d*d)));
	L[1] = 0.0;
	L[2] = (Math.sqrt(3*Math.PI) * r*r) / (2*d*d);
	L[3] = 0.0;
	L[4] = 0.0;
	L[5] = 0.0;
	L[6] = (Math.sqrt(5*Math.PI) * r*r * Math.sqrt(1 - (r*r)/(d*d))) / (2*d*d);
	L[7] = 0.0;
	L[8] = 0.0;
}

function onUpdate() {
	controls.update();

	var G = PRTCache[0];

	var verts = teapot.geometry.getAttribute("mycolor");
	for(var v = 0; v < verts.count; v++) {
		verts.array[v*3+0] = 1.0;
		verts.array[v*3+1] = 0.0;
		verts.array[v*3+2] = 0.0;
		for(var i = 0; i < N_COEFFS; i++) {
			var k = L[i] * G[v][i] * ALBEDO;
			verts.array[v*3+0] += k;
			verts.array[v*3+1] += k;
			verts.array[v*3+2] += k;
		}
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