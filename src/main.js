'use strict'

// Constants
var WINDOW_WIDTH = 800;
var WINDOW_HEIGHT = 600;
var ALBEDO = 1.0;
var USE_CACHE = false;
var N_COEFFS = 9;
var N_MONTE_CARLO = 50;
var RAY_OFFSET = 1e-18;
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
var objects = [];

var L = [];
var PRTCache = []; // list of G

var L_r = 0.5;
var L_d = 0.7;

// Events
document.addEventListener("load", onLoad());

document.addEventListener("keydown", function(event) {
	var key = event.key;

	var o = 0.1;

	if(key == "a") {
		L_r -= o;
	}
	else if(key == "s") {
		L_r += o;
	}

	if(key == "q") {
		L_d -= o;
	}
	else if(key == "w") {
		L_d += o;
	}
	precomputeL();
	console.log(L_r + " , " + L_d);

}, false);

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
		precomputeG();
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
	computeL_env_proj(L_r, L_d);
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

		//writeJson(PRTCache, PRECOMPUTE_FILE_NAME, 'text/plain');

		console.log("[done]");
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
		var pWi = 1.0 / (4.0 * Math.PI);
		var its = bvh.intersectRay(p, w, true);
		var V = its.length == 0;
		if(V) {
			var yi = SHEval3(w.x, w.y, w.z);
			for(var k = 0; k < N_COEFFS; k++) {
				G[v][k] += cosTheta * yi[k];
			}
		}
	}

	for(var k = 0; k < N_COEFFS; k++) {
		G[v][k] *= ALBEDO / (Math.PI * N_MONTE_CARLO * pWi);
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

	for(var j = 0; j < objects.length; j++) {
		var obj = objects[j];
		var G = PRTCache[j];
		var verts = obj.geometry.getAttribute("mycolor");
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