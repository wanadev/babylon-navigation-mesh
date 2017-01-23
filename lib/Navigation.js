"use strict";

var Class = require("abitbol");
var _ = require("lodash");
var Astar = require("./Astar.js");
var Channel = require("./Channel.js");

var BABYLON = require("babylonjs");

/**
 * This component generates screenshots of 3D models, in order to preview them when they are rendered.
 *
 * @class Focus3D
 * @constructor
 */

var Navigation = Class.$extend({
  __init__: function() {
    this.zoneNodes = {};
    this.astar = new Astar();
  },

  buildNodes: function(mesh) {
    var navigationMesh = this._buildNavigationMesh(mesh.geometry);

    var zoneNodes = this._groupNavMesh(navigationMesh);

    return zoneNodes;
  },

  setZoneData: function(zone, data) {
    this.zoneNodes[zone] = data;
  },

  getGroup: function(zone, position) {

    if (!this.zoneNodes[zone]) {
      return null;
    }

    var closestNodeGroup = null;

    var distance = Infinity;

    _.each(this.zoneNodes[zone].groups, function(group, index) {
      _.each(group, function(node) {
        var measuredDistance = BABYLON.Vector3.DistanceSquared(node.centroid, position);
        if (measuredDistance < distance) {
          closestNodeGroup = index;
          distance = measuredDistance;
        }
      });
    });

    return closestNodeGroup;
  },

  getRandomNode: function(zone, group, nearPosition, nearRange) {

    if (!this.zoneNodes[zone]) return new BABYLON.Vector3();

    nearPosition = nearPosition || null;
    nearRange = nearRange || 0;

    var candidates = [];

    var polygons = this.zoneNodes[zone].groups[group];

    _.each(polygons, function(p) {
      if (nearPosition && nearRange) {
        if (BABYLON.Vector3.DistanceSquared(nearPosition, p.centroid) < nearRange * nearRange) {
          candidates.push(p.centroid);
        }
      } else {
        candidates.push(p.centroid);
      }
    });

    return _.sample(candidates) || new BABYLON.Vector3();
  },

  projectOnNavmesh: function(position, zone, group) {
    var allNodes = this.zoneNodes[zone].groups[group];
    var vertices = this.zoneNodes[zone].vertices;

    var closestNode = null;
    var distance = Infinity;
    var finalProj = null,
      proj = null,
      node = null,
      measuredDistance = 0;

    for (var i = 0; i < allNodes.length; i++) {
      node = allNodes[i];

      proj = this._getProjectionOnNode(position, node, vertices);
      measuredDistance = BABYLON.Vector3.DistanceSquared(proj, position);

      if (measuredDistance < distance) {
        distance = measuredDistance;
        //this.meshes[3].position.copyFrom(proj);
        finalProj = proj;
        closestNode = node;
      }

    }

    return finalProj;
  },

  _projectPointOnPlane: function (point, plane) {
      var coef = BABYLON.Vector3.Dot(point, plane.normal) + plane.d;
      var proj = point.subtract(plane.normal.scale(coef));

      return proj;
  },

  _getProjectionOnNode: function(position, node, vertices) {

    var A = this.getVectorFrom(vertices, node.vertexIds[0]);
    var B = this.getVectorFrom(vertices, node.vertexIds[1]);
    var C = this.getVectorFrom(vertices, node.vertexIds[2]);
    var u = B.subtract(A);
    var v = C.subtract(A);
    var n = BABYLON.Vector3.Cross(u, v).normalize();

    var plane = {
      normal: n,
      d: -BABYLON.Vector3.Dot(A, n)
    };
    var p = this._projectPointOnPlane(position, plane);
    // Compute barycentric coordinates (u, v, w) for
    // point p with respect to triangle (a, b, c)
    var barycentric = function(p, a, b, c) {
      var ret = {};

      var v0 = c.subtract(a),
        v1 = b.subtract(a),
        v2 = p.subtract(a);

      var d00 = BABYLON.Vector3.Dot(v0, v0);
      var d01 = BABYLON.Vector3.Dot(v0, v1);
      var d02 = BABYLON.Vector3.Dot(v0, v2);
      var d11 = BABYLON.Vector3.Dot(v1, v1);
      var d12 = BABYLON.Vector3.Dot(v1, v2);
      var denom = d00 * d11 - d01 * d01;
      ret.u = (d11 * d02 - d01 * d12) / denom;
      ret.v = (d00 * d12 - d01 * d02) / denom;
      ret.w = 1 - ret.u - ret.v;

      return ret;
    };

    var bary = barycentric(p, A, B, C);

    bary.u = Math.min(Math.max(bary.u, 0), 1);
    bary.v = Math.min(Math.max(bary.v, 0), 1);

    if (bary.u + bary.v >= 1) {
      var sum = bary.u + bary.v;
      bary.u /= sum;
      bary.v /= sum;
    }

    var proj = A.add(B.subtract(A).scale(bary.v).add(C.subtract(A).scale(bary.u)));

    return proj;
  },

  findPath: function(startPosition, targetPosition, zone, group) {

    var allNodes = this.zoneNodes[zone].groups[group];
    var vertices = this.zoneNodes[zone].vertices;

    var closestNode = null;
    var distance = Infinity;

    allNodes.forEach(function(node) {
      var measuredDistance = BABYLON.Vector3.DistanceSquared(node.centroid, startPosition);
      if (measuredDistance < distance) {
        closestNode = node;
        distance = measuredDistance;
      }
    });


    var farthestNode = null;
    distance = Infinity;

    allNodes.forEach(function(node) {
      var measuredDistance = BABYLON.Vector3.DistanceSquared(node.centroid, targetPosition);
      if (measuredDistance < distance &&
        this._isVectorInPolygon(targetPosition, node, vertices)) {
        farthestNode = node;
        distance = measuredDistance;
      }
    }.bind(this));

    // If we can't find any node, just go straight to the target
    if (!closestNode || !farthestNode) {
      return null;
    }

    var paths = this.astar.search(allNodes, closestNode, farthestNode);

    var getPortalFromTo = function(a, b) {
      for (var i = 0; i < a.neighbours.length; i++) {
        if (a.neighbours[i] === b.id) {
          return a.portals[i];
        }
      }
    };

    // We got the corridor
    // Now pull the rope

    var channel = new Channel();

    channel.push(startPosition);

    for (var i = 0; i < paths.length; i++) {
      var polygon = paths[i];

      var nextPolygon = paths[i + 1];

      if (nextPolygon) {
        var portals = getPortalFromTo(polygon, nextPolygon);
        channel.push(
          this.getVectorFrom(vertices, portals[0]),
          this.getVectorFrom(vertices, portals[1])
        );
      }

    }

    channel.push(targetPosition);

    channel.stringPull();


    var vectors = [];

    channel.path.forEach(function(c) {
      var vec = new BABYLON.Vector3(c.x, c.y, c.z);

      // console.log(vec.clone().sub(startPosition).length());

      // Ensure the intermediate steps aren't too close to the start position
      // var dist = vec.clone().sub(startPosition).lengthSq();
      // if (dist > 0.01 * 0.01) {
      vectors.push(vec);
      // }


    });

    // We don't need the first one, as we already know our start position
    vectors.shift();

    return vectors;
  },

  _isPointInPoly: function(poly, pt) {
    for (var c = false, i = -1, l = poly.length, j = l - 1; ++i < l; j = i)
      ((poly[i].z <= pt.z && pt.z < poly[j].z) || (poly[j].z <= pt.z && pt.z < poly[i].z)) && (pt.x < (poly[j].x - poly[i].x) * (pt.z - poly[i].z) / (poly[j].z - poly[i].z) + poly[i].x) && (c = !c);
    return c;
  },

  _isVectorInPolygon: function(vector, polygon, vertices) {

    // reference point will be the centroid of the polygon
    // We need to rotate the vector as well as all the points which the polygon uses
    var lowestPoint = 100000;
    var highestPoint = -100000;

    var polygonVertices = [];

    _.each(polygon.vertexIds, function(vId) {
      var point = this.getVectorFrom(vertices, vId);
      lowestPoint = Math.min(point.y, lowestPoint);
      highestPoint = Math.max(point.y, highestPoint);
      polygonVertices.push(point);
    }.bind(this));

    if (vector.y < highestPoint + 0.5 && vector.y > lowestPoint - 0.5 &&
      this._isPointInPoly(polygonVertices, vector)) {
      return true;
    }
    return false;
  },

  _computeCentroids: function(geometry) {
    var centroids = [];
    var indices = geometry.getIndices();
    var vertices = geometry.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    var c = new BABYLON.Vector3(0, 0, 0);

    for (var f = 0; f < indices.length; f += 3) {
      var p1 = this.getVectorFrom(vertices, indices[f]);
      var p2 = this.getVectorFrom(vertices, indices[f + 1]);
      var p3 = this.getVectorFrom(vertices, indices[f + 2]);

      c.copyFromFloats(0, 0, 0);

      c.addInPlace(p1);
      c.addInPlace(p2);
      c.addInPlace(p3);

      c.scaleInPlace(1 / 3);

      centroids.push(c.clone());
    }
    geometry.centroids = centroids;
  },


  _roundNumber: function(number, decimals) {
    var newnumber = new Number(number + '').toFixed(parseInt(decimals));
    return parseFloat(newnumber);
  },

  _mergeVertexIds: function(aList, bList) {

    var sharedVertices = [];

    aList.forEach(function(vId) {
      if (_.includes(bList, vId)) {
        sharedVertices.push(vId);
      }
    });

    if (sharedVertices.length < 2) return [];

    // console.log("TRYING aList:", aList, ", bList:", bList, ", sharedVertices:", sharedVertices);

    if (_.includes(sharedVertices, aList[0]) && _.includes(sharedVertices, aList[aList.length - 1])) {
      // Vertices on both edges are bad, so shift them once to the left
      aList.push(aList.shift());
    }

    if (_.includes(sharedVertices, bList[0]) && _.includes(sharedVertices, bList[bList.length - 1])) {
      // Vertices on both edges are bad, so shift them once to the left
      bList.push(bList.shift());
    }

    // Again!
    sharedVertices = [];

    aList.forEach(function(vId) {
      if (_.includes(bList, vId)) {
        sharedVertices.push(vId);
      }
    });

    var clockwiseMostSharedVertex = sharedVertices[1];
    var counterClockwiseMostSharedVertex = sharedVertices[0];


    var cList = _.clone(aList);
    while (cList[0] !== clockwiseMostSharedVertex) {
      cList.push(cList.shift());
    }

    var c = 0;

    var temp = _.clone(bList);
    while (temp[0] !== counterClockwiseMostSharedVertex) {
      temp.push(temp.shift());

      if (c++ > 10) break;
    }

    // Shave
    temp.shift();
    temp.pop();

    cList = cList.concat(temp);

    // console.log("aList:", aList, ", bList:", bList, ", cList:", cList, ", sharedVertices:", sharedVertices);

    return cList;
  },

  _setPolygonCentroid: function(polygon, navigationMesh) {
    var sum = new BABYLON.Vector3(0, 0, 0);

    var vertices = navigationMesh.vertices;

    _.each(polygon.vertexIds, function(vId) {
      sum.x += vertices[vId * 3];
      sum.y += vertices[vId * 3 + 1];
      sum.z += vertices[vId * 3 + 2];
    });

    sum.scaleInPlace(1 / polygon.vertexIds.length);

    polygon.centroid.copyFrom(sum);
  },

  getVectorFrom: function(vertices, id, _vector) {
    if (_vector) {
      _vector.copyFromFloats(vertices[id * 3], vertices[id * 3 + 1], vertices[id * 3 + 2]);
      return _vector;
    }
    return new BABYLON.Vector3(vertices[id * 3], vertices[id * 3 + 1], vertices[id * 3 + 2]);
  },

  _cleanPolygon: function(polygon, navigationMesh) {

    var newVertexIds = [];

    var vertices = navigationMesh.vertices;

    for (var i = 0; i < polygon.vertexIds.length; i++) {

      var vertex = this.getVectorFrom(vertices, polygon.vertexIds[i]);

      var nextVertexId, previousVertexId;
      var nextVertex, previousVertex;

      // console.log("nextVertex: ", nextVertex);

      if (i === 0) {
        nextVertexId = polygon.vertexIds[1];
        previousVertexId = polygon.vertexIds[polygon.vertexIds.length - 1];
      } else if (i === polygon.vertexIds.length - 1) {
        nextVertexId = polygon.vertexIds[0];
        previousVertexId = polygon.vertexIds[polygon.vertexIds.length - 2];
      } else {
        nextVertexId = polygon.vertexIds[i + 1];
        previousVertexId = polygon.vertexIds[i - 1];
      }

      nextVertex = this.getVectorFrom(vertices, nextVertexId);
      previousVertex = this.getVectorFrom(vertices, previousVertexId);

      var a = nextVertex.clone().sub(vertex);
      var b = previousVertex.clone().sub(vertex);

      var angle = a.angleTo(b);

      // console.log(angle);

      if (angle > Math.PI - 0.01 && angle < Math.PI + 0.01) {
        // Unneccesary vertex
        // console.log("Unneccesary vertex: ", polygon.vertexIds[i]);
        // console.log("Angle between "+previousVertexId+", "+polygon.vertexIds[i]+" "+nextVertexId+" was: ", angle);


        // Remove the neighbours who had this vertex
        var goodNeighbours = [];
        polygon.neighbours.forEach(function(neighbour) {
          if (!_.includes(neighbour.vertexIds, polygon.vertexIds[i])) {
            goodNeighbours.push(neighbour);
          }
        });
        polygon.neighbours = goodNeighbours;


        // TODO cleanup the list of vertices and rebuild vertexIds for all polygons
      } else {
        newVertexIds.push(polygon.vertexIds[i]);
      }

    }

    // console.log("New vertexIds: ", newVertexIds);

    polygon.vertexIds = newVertexIds;

    this._setPolygonCentroid(polygon, navigationMesh);

  },

  _isConvex: function(polygon, navigationMesh) {

    var vertices = navigationMesh.vertices;

    if (polygon.vertexIds.length < 3) return false;

    var convex = true;

    var total = 0;

    var results = [];

    for (var i = 0; i < polygon.vertexIds.length; i++) {

      var vertex = this.getVectorFrom(vertices, polygon.vertexIds[i]);

      var nextVertex, previousVertex;

      // console.log("nextVertex: ", nextVertex);

      if (i === 0) {
        nextVertex = this.getVectorFrom(vertices, polygon.vertexIds[1]);
        previousVertex = this.getVectorFrom(vertices, polygon.vertexIds[polygon.vertexIds.length - 1]);
      } else if (i === polygon.vertexIds.length - 1) {
        nextVertex = this.getVectorFrom(vertices, polygon.vertexIds[0]);
        previousVertex = this.getVectorFrom(vertices, polygon.vertexIds[polygon.vertexIds.length - 2]);
      } else {
        nextVertex = this.getVectorFrom(vertices, polygon.vertexIds[i + 1]);
        previousVertex = this.getVectorFrom(vertices, polygon.vertexIds[i - 1]);
      }

      var a = nextVertex.clone().sub(vertex);
      var b = previousVertex.clone().sub(vertex);

      var angle = a.angleTo(b);
      total += angle;

      // console.log(angle);
      if (angle === Math.PI || angle === 0) return false;

      var r = BABYLON.Vector3.Cross(a, b).y;
      results.push(r);
      // console.log("pushed: ", r);
    }

    // if ( total > (polygon.vertexIds.length-2)*Math.PI ) return false;

    results.forEach(function(r) {
      if (r === 0) convex = false;
    });

    if (results[0] > 0) {
      results.forEach(function(r) {
        if (r < 0) convex = false;
      });
    } else {
      results.forEach(function(r) {
        if (r > 0) convex = false;
      });
    }

    // console.log("allowed: "+total+", max: "+(polygon.vertexIds.length-2)*Math.PI);
    // if ( total > (polygon.vertexIds.length-2)*Math.PI ) convex = false;

    // console.log("Convex: "+(convex ? "true": "false"));



    return convex;
  },

  _buildPolygonGroups: function(navigationMesh) {

    var polygons = navigationMesh.polygons;

    var polygonGroups = [];
    var groupCount = 0;

    var spreadGroupId = function(polygon) {
      _.each(polygon.neighbours, function(neighbour) {
        if (_.isUndefined(neighbour.group)) {
          neighbour.group = polygon.group;
          spreadGroupId(neighbour);
        }
      });
    };

    _.each(polygons, function(polygon) {

      if (_.isUndefined(polygon.group)) {
        polygon.group = groupCount++;
        // Spread it
        spreadGroupId(polygon);
      }

      if (!polygonGroups[polygon.group]) polygonGroups[polygon.group] = [];

      polygonGroups[polygon.group].push(polygon);
    });

    console.log("Groups built: ", polygonGroups.length);

    return polygonGroups;
  },

  _array_intersect: function() {
    var i, shortest, nShortest, n, len, ret = [],
      obj = {},
      nOthers;
    nOthers = arguments.length - 1;
    nShortest = arguments[0].length;
    shortest = 0;
    for (i = 0; i <= nOthers; i++) {
      n = arguments[i].length;
      if (n < nShortest) {
        shortest = i;
        nShortest = n;
      }
    }

    for (i = 0; i <= nOthers; i++) {
      n = (i === shortest) ? 0 : (i || shortest); //Read the shortest array first. Read the first array instead of the shortest
      len = arguments[n].length;
      for (var j = 0; j < len; j++) {
        var elem = arguments[n][j];
        if (obj[elem] === i - 1) {
          if (i === nOthers) {
            ret.push(elem);
            obj[elem] = 0;
          } else {
            obj[elem] = i;
          }
        } else if (i === 0) {
          obj[elem] = 0;
        }
      }
    }
    return ret;
  },

  _buildPolygonNeighbours: function(polygon, navigationMesh) {
    polygon.neighbours = [];

    // All other nodes that contain at least two of our vertices are our neighbours
    for (var i = 0, len = navigationMesh.polygons.length; i < len; i++) {
      if (polygon === navigationMesh.polygons[i]) continue;

      // Don't check polygons that are too far, since the intersection tests take a long time
      if (BABYLON.Vector3.DistanceSquared(polygon.centroid, navigationMesh.polygons[i].centroid) > 100 * 100) continue;

      var matches = this._array_intersect(polygon.vertexIds, navigationMesh.polygons[i].vertexIds);
      // var matches = _.intersection(polygon.vertexIds, navigationMesh.polygons[i].vertexIds);

      if (matches.length >= 2) {
        polygon.neighbours.push(navigationMesh.polygons[i]);
      }
    }
  },

  _buildPolygonsFromGeometry: function(geometry) {

    var polygons = [];
    var vertices = geometry.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    var indices = geometry.getIndices();
    var polygonId = 1;

    console.log("Vertices:", vertices.length / 3, "polygons:", indices.length / 3);

    // Convert the faces into a custom format that supports more than 3 vertices
    for (var i = 0; i < indices.length; i += 3) {

      var a = this.getVectorFrom(vertices, indices[i]);
      var b = this.getVectorFrom(vertices, indices[i + 1]);
      var c = this.getVectorFrom(vertices, indices[i + 2]);
      var normal = BABYLON.Vector3.Cross(b.subtract(a), b.subtract(c)).normalize();

      polygons.push({
        id: polygonId++,
        vertexIds: [indices[i], indices[i + 1], indices[i + 2]],
        centroid: geometry.centroids[i / 3],
        normal: normal,
        neighbours: []
      });
    }

    var navigationMesh = {
      polygons: polygons,
      vertices: vertices
    };

    // Build a list of adjacent polygons
    _.each(polygons, function(polygon) {
      this._buildPolygonNeighbours(polygon, navigationMesh);
    }.bind(this));

    return navigationMesh;
  },

  _cleanNavigationMesh: function(navigationMesh) {

    var polygons = navigationMesh.polygons;
    var vertices = navigationMesh.vertices;


    // Remove steep triangles
    var up = new BABYLON.Vector3(0, 1, 0);
    polygons = _.filter(polygons, function(polygon) {
      var angle = Math.acos(BABYLON.Vector3.Dot(up, polygon.normal));
      return angle < (Math.PI / 4);
    });


    // Remove unnecessary edges using the Hertel-Mehlhorn algorithm

    // 1. Find a pair of adjacent nodes (i.e., two nodes that share an edge between them)
    //    whose normals are nearly identical (i.e., their surfaces face the same direction).


    var newPolygons = [];

    _.each(polygons, function(polygon) {

      if (polygon.toBeDeleted) return;

      var keepLooking = true;

      while (keepLooking) {
        keepLooking = false;

        _.each(polygon.neighbours, function(otherPolygon) {

          if (polygon === otherPolygon) return;

          if (Math.acos(BABYLON.Vector3.Dot(polygon.normal, otherPolygon.normal)) < 0.01) {
            // That's pretty equal alright!

            // Merge otherPolygon with polygon

            var testPolygon = {
              vertexIds: this._mergeVertexIds(polygon.vertexIds, otherPolygon.vertexIds),
              neighbours: polygon.neighbours,
              normal: polygon.normal.clone(),
              centroid: polygon.centroid.clone()
            };

            this._cleanPolygon(testPolygon, navigationMesh);

            if (this._isConvex(testPolygon, navigationMesh)) {
              otherPolygon.toBeDeleted = true;


              // Inherit the neighbours from the to be merged polygon, except ourself
              _.each(otherPolygon.neighbours, function(otherPolygonNeighbour) {

                // Set this poly to be merged to be no longer our neighbour
                otherPolygonNeighbour.neighbours = _.without(otherPolygonNeighbour.neighbours, otherPolygon);

                if (otherPolygonNeighbour !== polygon) {
                  // Tell the old Polygon's neighbours about the new neighbour who has merged
                  otherPolygonNeighbour.neighbours.push(polygon);
                } else {
                  // For ourself, we don't need to know about ourselves
                  // But we inherit the old neighbours
                  polygon.neighbours = polygon.neighbours.concat(otherPolygon.neighbours);
                  polygon.neighbours = _.uniq(polygon.neighbours);

                  // Without ourselves in it!
                  polygon.neighbours = _.without(polygon.neighbours, polygon);
                }
              });

              polygon.vertexIds = this._mergeVertexIds(polygon.vertexIds, otherPolygon.vertexIds);

              this._cleanPolygon(polygon, navigationMesh);

              keepLooking = true;
            }

          }
        }.bind(this));
      }


      if (!polygon.toBeDeleted) {
        newPolygons.push(polygon);
      }

    });

    var isUsed = function(vId) {
      var contains = false;
      _.each(newPolygons, function(p) {
        if (!contains && _.includes(p.vertexIds, vId)) {
          contains = true;
        }
      });
      return contains;
    };

    // Clean vertices
    for (var i = 0; i < vertices.length; i++) {
      if (!isUsed(i)) {

        // Decrement all vertices that are higher than i
        _.each(newPolygons, function(p) {
          for (var j = 0; j < p.vertexIds.length; j++) {
            if (p.vertexIds[j] > i) {
              p.vertexIds[j]--;
            }
          }
        });

        vertices.splice(i, 1);
        i--;
      }

    }

    navigationMesh.polygons = newPolygons;
    navigationMesh.vertices = vertices;

  },

  _buildNavigationMesh: function(geometry) {
    // Prepare geometry
    this._computeCentroids(geometry);

    this._mergeVertices(geometry);
    // BABYLON.GeometryUtils.triangulateQuads(geometry);

    // console.log("vertices:", geometry.vertices.length, "polygons:", geometry.faces.length);

    var navigationMesh = this._buildPolygonsFromGeometry(geometry);

    // cleanNavigationMesh(navigationMesh);
    // console.log("Pre-clean:", navigationMesh.polygons.length, "polygons,", navigationMesh.vertices.length, "vertices.");

    // console.log("")
    // console.log("Vertices:", navigationMesh.vertices.length, "polygons,", navigationMesh.polygons.length, "vertices.");

    return navigationMesh;
  },

  _mergeVertices: function(geometry) {
    var verticesMap = {}; // Hashmap for looking up vertices by position coordinates (and making sure they are unique)
    var unique = [],
      changes = [];

    var v, key;
    var precisionPoints = 4; // number of decimal points, e.g. 4 for epsilon of 0.0001
    var precision = Math.pow(10, precisionPoints);
    var indices;
    var ind = geometry.getIndices(),
      vert = geometry.getVerticesData(BABYLON.VertexBuffer.PositionKind);

    for (var i = 0; i < vert.length; i += 3) {

      v = new BABYLON.Vector3(vert[i], vert[i + 1], vert[i + 2]);
      key = Math.round(v.x * precision) + '_' + Math.round(v.y * precision) + '_' + Math.round(v.z * precision);

      if (verticesMap[key] === undefined) {

        verticesMap[key] = i / 3;
        unique.push(v.clone());
        changes[i / 3] = unique.length - 1;

      } else {

        //console.log('Duplicate vertex found. ', i, ' could be using ', verticesMap[key]);
        changes[i / 3] = changes[verticesMap[key]];

      }

    }


    // if faces are completely degenerate after merging vertices, we
    // have to remove them from the geometry.
    var faceIndicesToRemove = [];

    for (i = 0; i < ind.length; i += 3) {

      ind[i] = changes[ind[i]];
      ind[i + 1] = changes[ind[i + 1]];
      ind[i + 2] = changes[ind[i + 2]];

      indices = [ind[i], ind[i + 1], ind[i + 2]];

      var dupIndex = -1;

      // if any duplicate vertices are found in a Face3
      // we have to remove the face as nothing can be saved
      for (var n = 0; n < 3; n++) {

        if (indices[n] === indices[(n + 1) % 3]) {

          dupIndex = n;
          faceIndicesToRemove.push(i);
          break;

        }

      }

    }

    for (i = faceIndicesToRemove.length - 1; i >= 0; i--) {

      var idx = faceIndicesToRemove[i];

      ind.splice(idx, 3);

    }

    // Use unique set of vertices

    var diff = vert.length / 3 - unique.length;
    vert = [];
    for (i = 0; i < unique.length; i++) {
      vert.push(unique[i].x, unique[i].y, unique[i].z);
    }

    geometry.setIndices(ind);
    geometry.setVerticesData(BABYLON.VertexBuffer.PositionKind, vert);

    return diff;
  },


  _getSharedVerticesInOrder: function(a, b) {

    var aList = a.vertexIds;
    var bList = b.vertexIds;

    var sharedVertices = [];

    _.each(aList, function(vId) {
      if (_.includes(bList, vId)) {
        sharedVertices.push(vId);
      }
    });

    if (sharedVertices.length < 2) return [];

    // console.log("TRYING aList:", aList, ", bList:", bList, ", sharedVertices:", sharedVertices);

    if (_.includes(sharedVertices, aList[0]) && _.includes(sharedVertices, aList[aList.length - 1])) {
      // Vertices on both edges are bad, so shift them once to the left
      aList.push(aList.shift());
    }

    if (_.includes(sharedVertices, bList[0]) && _.includes(sharedVertices, bList[bList.length - 1])) {
      // Vertices on both edges are bad, so shift them once to the left
      bList.push(bList.shift());
    }

    // Again!
    sharedVertices = [];

    _.each(aList, function(vId) {
      if (_.includes(bList, vId)) {
        sharedVertices.push(vId);
      }
    });

    return sharedVertices;
  },

  _groupNavMesh: function(navigationMesh) {

    var saveObj = {};

    _.each(navigationMesh.vertices, function(v) {
      v = this._roundNumber(v, 2);
    }.bind(this));

    saveObj.vertices = navigationMesh.vertices;

    var groups = this._buildPolygonGroups(navigationMesh);

    saveObj.groups = [];

    var findPolygonIndex = function(group, p) {
      for (var i = 0; i < group.length; i++) {
        if (p === group[i]) return i;
      }
    };

    _.each(groups, function(group) {

      var newGroup = [];

      _.each(group, function(p) {

        var neighbours = [];

        _.each(p.neighbours, function(n) {
          neighbours.push(findPolygonIndex(group, n));
        });


        // Build a portal list to each neighbour
        var portals = [];
        _.each(p.neighbours, function(n) {
          portals.push(this._getSharedVerticesInOrder(p, n));
        }.bind(this));


        p.centroid.x = this._roundNumber(p.centroid.x, 2);
        p.centroid.y = this._roundNumber(p.centroid.y, 2);
        p.centroid.z = this._roundNumber(p.centroid.z, 2);

        newGroup.push({
          id: findPolygonIndex(group, p),
          neighbours: neighbours,
          vertexIds: p.vertexIds,
          centroid: p.centroid,
          portals: portals
        });

      }.bind(this));

      saveObj.groups.push(newGroup);
    }.bind(this));

    return saveObj;
  },
});

module.exports = Navigation;
