'use strict'

var WINDOW_WIDTH = 800;
var WINDOW_HEIGHT = 600;

var scene = null;
var camera = null;
var renderer = null;
var teapot = null;

document.addEventListener("load", onLoad());

function onLoad() {	
	onInit();
	onRender();
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
	camera.position.x = 7.54;
	camera.position.y = 3.77;
	camera.position.z = 7.54;
	camera.lookAt(new THREE.Vector3(0,0,0));

	// plane
	var geometry = new THREE.PlaneGeometry(10,10,1,1);	
	var materialPlane = new THREE.MeshBasicMaterial( {color: 0x00ff00, side: THREE.DoubleSide} );
	var plane = new THREE.Mesh(geometry, materialPlane);
	scene.add(plane);

	plane.rotation.x = Math.PI/2;
	
	// teapot
	var material = new THREE.MeshNormalMaterial();

	var loader = new THREE.OBJLoader();
	loader.load('assets/teapot.obj', function(object) {
		scene.add(object);
		object.children[0].material = material;
		console.log('loaded teapot');
		teapot = object;
	});
}

function onUpdate() {
	teapot.rotation.y += 0.1;
}