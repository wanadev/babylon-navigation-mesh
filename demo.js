"use strict";

// get the canvas DOM element
var canvas = document.getElementById('renderCanvas');

// load the 3D engine
var engine = new BABYLON.Engine(canvas, true);

var navigation = new Navigation();
var line = null;

var loadScene = function() {
    //load babylon scene of museum
    var onLoaded = function(loadedScene) {
        var navmesh = scene.getMeshByName("Navmesh");
        navmesh.material = new BABYLON.StandardMaterial("navMaterial", scene);
        navmesh.material.diffuseColor = new BABYLON.Color3(0, 1, 0);
        navmesh.material.alpha = 0.5;
        navmesh.material.wireframe = true;
        for (var i = 0; i < scene.meshes.length; i++) {
            scene.meshes[i].convertToFlatShadedMesh();
        }

        var zoneNodes = navigation.buildNodes(navmesh);
        navigation.setZoneData('level', zoneNodes);
    };

    BABYLON.SceneLoader.Append("./mesh/", "level.babylon", scene, onLoaded.bind(this));
};

// Set the basics
var scene = new BABYLON.Scene(engine);
var camera = new BABYLON.ArcRotateCamera("ArcRotateCamera", 1, 0.8, 10, new BABYLON.Vector3(0, 0, 0), scene);
camera.setTarget(BABYLON.Vector3.Zero());
camera.attachControl(canvas, false);
var light = new BABYLON.HemisphericLight('light1', new BABYLON.Vector3(0,1,0), scene);
light.intensity = 0.5;

// Create a minimoi
var minimoi = BABYLON.Mesh.CreateBox("Me", 0.2, scene);
minimoi.material = new BABYLON.StandardMaterial("navMaterial", scene);
minimoi.material.diffuseColor = new BABYLON.Color3(1., 0., 0);
minimoi.position = new BABYLON.Vector3( -3.7426157086231813, 0.32968033243017736, -5.410392414960055);
loadScene();

// run the render loop
engine.runRenderLoop(function(){
    scene.render();
});

// the canvas/window resize event handler
window.addEventListener('resize', function(){
    engine.resize();
});

canvas.addEventListener('click', function(event) {
    var pickingInfo = scene.pick(scene.pointerX, scene.pointerY);
    if (!pickingInfo.hit) return;

    var path = navigation.findPath(minimoi.position, pickingInfo.pickedPoint, 'level', navigation.getGroup('level', minimoi.position)) || [];
    if (path && path.length > 0) {
        var length = 0;
        var direction = [{
            frame: 0,
            value: minimoi.position
        }];
        for (var i = 0; i < path.length; i++) {
            var vector = new BABYLON.Vector3(path[i].x, path[i].y, path[i].z);
            length += BABYLON.Vector3.Distance(direction[i].value, vector);
            direction.push({
                frame: length*100,
                value: vector
            });
        }

        for (var i = 0; i < direction.length; i++) {
            direction[i].frame /= length;
        }

        var moveCamera = new BABYLON.Animation("CameraMove", "position", 180/length+10, BABYLON.Animation.ANIMATIONTYPE_VECTOR3, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
        moveCamera.setKeys(direction);
        minimoi.animations.push(moveCamera);

        if (line) line.dispose();
        line = BABYLON.Mesh.CreateLines("lines", [minimoi.position].concat(path), scene);
        line.color = new BABYLON.Color3(1, 0, 0);
        line.position.y = 0.001;

        scene.beginAnimation(minimoi, 0, 100);
    }

});
