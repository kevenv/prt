var scene = new THREE.Scene();
var camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 1000);

var renderer = new THREE.WebGLRenderer();
var offset = 20;
renderer.setSize(800, 600);
document.body.appendChild(renderer.domElement);

var geometry = new THREE.PlaneGeometry(10,10,1,1);
var material = new THREE.MeshNormalMaterial();
var materialCube = new THREE.MeshBasicMaterial( {color: 0x00ff00, side: THREE.DoubleSide} );
var cube = new THREE.Mesh(geometry, materialCube);
scene.add(cube);

cube.rotation.x = Math.PI/2;

camera.position.x = 7.54;
camera.position.y = 3.77;
camera.position.z = 7.54;
camera.lookAt(new THREE.Vector3(0,0,0));

var loader = new THREE.OBJLoader();
	loader.load('assets/teapot.obj', function(object) {
	console.log('added teapot');
	scene.add(object);
	teapot = object;
	teapot.children[0].material = material;
});

function render() {
	requestAnimationFrame(render);

	teapot.rotation.y += 0.1;

	renderer.render(scene,camera);
}

render();