module.exports = function(grunt) {

    var browserifyAlias = ["./node_modules/babylonjs/babylon.max.js:babylonjs"];

    // Project configuration.
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),

        browserify: {
            build: {
                files: {
                    'build/<%= pkg.name %>.js': ['src/Navigation.js']
                }
            },
            options: {
                alias: browserifyAlias,
                browserifyOptions: {
                    'standalone': 'Navigation'
                }
            }
        },

        uglify: {
            build: {
                files: {
                    'build/<%= pkg.name %>.min.js': ['build/<%= pkg.name %>.js']
                }
            }
        },

        watch: {
            js: {
                files: ['src/*.js'],
                tasks: ['browserify'],
                options: {
                    spawn: false
                }
            }
        },

        clean: {
            dist: ['build']
        },

    });


    grunt.loadNpmTasks('grunt-contrib-clean');
    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-browserify');
    grunt.loadNpmTasks('grunt-contrib-watch');

    grunt.registerTask('default', ['browserify', 'uglify']);

};
